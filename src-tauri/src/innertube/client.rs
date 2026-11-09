use std::time::Duration;

use serde_json::{json, Value};

use crate::auth::{CookieAuth, LIST_ACCOUNTS_URL, ORIGIN};
use crate::innertube::endpoints::{
    ClientKind, ACCOUNT_MENU, ANDROID_CLIENT_NAME, ANDROID_CLIENT_VERSION, ANDROID_OS_VERSION,
    ANDROID_SDK, ANDROID_USER_AGENT, BASE_URL, BROWSE, GUIDE, IOS_CLIENT_NAME, IOS_CLIENT_VERSION,
    IOS_DEVICE_MODEL, IOS_OS_VERSION, LOCALE, NEXT, PLAYER, REGION, SEARCH, SUGGESTIONS,
    USER_AGENT, VR_ANDROID_SDK, VR_CLIENT_NAME, VR_CLIENT_VERSION, VR_DEVICE_MAKE, VR_DEVICE_MODEL,
    VR_OS_VERSION, VR_USER_AGENT, WEB_CLIENT_NAME, WEB_CLIENT_VERSION,
};
use crate::innertube::models::{Account, GuideEntry, HomeFeed, Lyrics, SearchFeed, Stream, Track};
use crate::innertube::parsers::{
    parse_account, parse_guide, parse_home_feed, parse_list_account_rows, parse_lyrics,
    parse_lyrics_browse_id, parse_queue, parse_search_feed, parse_stream_with, parse_suggestions,
};

pub const HOME_BROWSE_IDS: [&str; 2] = ["FEmusic_home", "FEmusic_explore"];

/// Only /player needs the Android client (itag 18); browsing stays WEB_REMIX
/// so the payloads match the ones the music web app renders.
pub fn client_kind_for(endpoint: &str) -> ClientKind {
    if endpoint == PLAYER {
        ClientKind::Android
    } else {
        ClientKind::WebRemix
    }
}

pub fn user_agent_for(kind: ClientKind) -> &'static str {
    match kind {
        ClientKind::Android => ANDROID_USER_AGENT,
        ClientKind::AndroidVr => VR_USER_AGENT,
        ClientKind::Ios | ClientKind::WebRemix => USER_AGENT,
    }
}

/// WEB SAPISIDHASH on ANDROID/IOS /player is INVALID_ARGUMENT once logged in
/// (probed 2026-11-06). Cookies stay; only WEB_REMIX signs.
pub fn signs_with_sapisid(kind: ClientKind) -> bool {
    kind == ClientKind::WebRemix
}

pub fn request_body(endpoint: &str, params: Value) -> Value {
    request_body_for(client_kind_for(endpoint), params)
}

/// URL / mime / itag that a bare `<audio>` can decode. Adaptive itag 140 is
/// DASH (`ftypdash`) and WKWebView rejects it; ANDROID itag 18 is
/// progressive (`ftypmp42`, probed 2026-11-05 on Slipknot / Before I Forget).
pub fn playback_source(
    stream: &Stream,
    variant: Option<&str>,
) -> Result<(String, String, u32), String> {
    if variant == Some("webm") {
        if stream.audio_url.is_empty() {
            return Err(format!(
                "player \"{}\" returned no webm audio url",
                stream.video_id
            ));
        }
        return Ok((
            stream.audio_url.clone(),
            stream.mime_type.clone(),
            stream.itag,
        ));
    }
    if !stream.fallback_url.is_empty() {
        return Ok((
            stream.fallback_url.clone(),
            stream.fallback_mime.clone(),
            stream.fallback_itag,
        ));
    }
    if stream.audio_url.is_empty() {
        return Err(format!(
            "player \"{}\" returned no playable media url",
            stream.video_id
        ));
    }
    Ok((
        stream.audio_url.clone(),
        stream.mime_type.clone(),
        stream.itag,
    ))
}

pub fn request_body_for(kind: ClientKind, params: Value) -> Value {
    let mut body = match params {
        Value::Object(params) => params,
        _ => serde_json::Map::new(),
    };
    body.insert("context".to_string(), client_context(kind));
    if kind != ClientKind::WebRemix {
        body.entry("contentCheckOk".to_string())
            .or_insert(json!(true));
        body.entry("racyCheckOk".to_string()).or_insert(json!(true));
    }
    Value::Object(body)
}

fn client_context(kind: ClientKind) -> Value {
    match kind {
        ClientKind::WebRemix => json!({
            "client": {
                "clientName": WEB_CLIENT_NAME,
                "clientVersion": WEB_CLIENT_VERSION,
                "hl": LOCALE,
                "gl": REGION,
            }
        }),
        ClientKind::Ios => json!({
            "client": {
                "clientName": IOS_CLIENT_NAME,
                "clientVersion": IOS_CLIENT_VERSION,
                "deviceModel": IOS_DEVICE_MODEL,
                "osName": "iPhone",
                "osVersion": IOS_OS_VERSION,
                "hl": LOCALE,
                "gl": REGION,
            }
        }),
        ClientKind::Android => json!({
            "client": {
                "clientName": ANDROID_CLIENT_NAME,
                "clientVersion": ANDROID_CLIENT_VERSION,
                "androidSdkVersion": ANDROID_SDK,
                "osName": "Android",
                "osVersion": ANDROID_OS_VERSION,
                "hl": LOCALE,
                "gl": REGION,
            }
        }),
        ClientKind::AndroidVr => json!({
            "client": {
                "clientName": VR_CLIENT_NAME,
                "clientVersion": VR_CLIENT_VERSION,
                "deviceMake": VR_DEVICE_MAKE,
                "deviceModel": VR_DEVICE_MODEL,
                "androidSdkVersion": VR_ANDROID_SDK,
                "osName": "Android",
                "osVersion": VR_OS_VERSION,
                "hl": LOCALE,
                "gl": REGION,
            }
        }),
    }
}

pub struct MusicClient {
    base_url: String,
    http: reqwest::blocking::Client,
    credentials: Option<CookieAuth>,
}

impl Default for MusicClient {
    fn default() -> Self {
        Self::new()
    }
}

impl MusicClient {
    pub fn new() -> Self {
        Self::with_base(BASE_URL)
    }

    pub fn with_base(base_url: &str) -> Self {
        let http = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(25))
            .build()
            .expect("build the innertube HTTP client");
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            http,
            credentials: None,
        }
    }

    /// Signed-in calls carry the browser cookies plus the `SAPISIDHASH`
    /// signature the music web app sends.
    pub fn with_cookies(mut self, credentials: Option<CookieAuth>) -> Self {
        self.credentials = credentials;
        self
    }

    /// The anonymous home feed (`FEmusic_home`) intermittently answers with no
    /// shelves; `FEmusic_explore` is the same carousel shape and rarely empty.
    /// Mood chips send `params` and must stay on home — explore is the wrong page.
    pub fn home(&self, params: Option<&str>) -> Result<HomeFeed, String> {
        let mut last_error = None;
        let filtered = params.filter(|value| !value.is_empty());
        let browse_ids: &[&str] = if filtered.is_some() {
            &["FEmusic_home"]
        } else {
            &HOME_BROWSE_IDS
        };
        for browse_id in browse_ids {
            let mut body = json!({ "browseId": browse_id });
            if let Some(params) = filtered {
                body["params"] = json!(params);
            }
            match self.browse(body) {
                Ok(feed) if !feed.shelves.is_empty() => return Ok(feed),
                Ok(_) => continue,
                Err(error) => last_error = Some(error),
            }
        }
        match last_error {
            Some(error) => Err(error),
            None => Ok(HomeFeed::default()),
        }
    }

    /// One browseId, no home→explore fallback. Explorar and Biblioteca are
    /// their own pages (FEmusic_explore / FEmusic_library_landing).
    pub fn browse_page(&self, browse_id: &str) -> Result<HomeFeed, String> {
        let id = browse_id.trim();
        if id.is_empty() {
            return Err("browse id is empty".into());
        }
        self.browse(json!({ "browseId": id }))
    }

    fn browse(&self, body: Value) -> Result<HomeFeed, String> {
        let payload = self.call(BROWSE, request_body(BROWSE, body))?;
        parse_home_feed(&payload)
    }

    pub fn search(&self, query: &str, params: Option<&str>) -> Result<SearchFeed, String> {
        let mut body = json!({ "query": query });
        if let Some(params) = params.map(str::trim).filter(|value| !value.is_empty()) {
            body["params"] = json!(params);
        }
        let payload = self.call(SEARCH, request_body(SEARCH, body))?;
        parse_search_feed(&payload)
    }

    pub fn lyrics(
        &self,
        video_id: &str,
        title: &str,
        artist: &str,
        duration_sec: f64,
    ) -> Result<Lyrics, String> {
        let lyrics = self.innertube_lyrics(video_id)?;
        if let Some(lrc) = crate::lrclib::fetch_synced_lyrics(title, artist, duration_sec) {
            return Ok(crate::lrclib::overlay_synced(&lyrics, &lrc));
        }
        Ok(lyrics)
    }

    fn innertube_lyrics(&self, video_id: &str) -> Result<Lyrics, String> {
        let id = video_id.trim();
        if id.is_empty() {
            return Err("video id is empty".into());
        }
        let next = self.call(NEXT, request_body(NEXT, json!({ "videoId": id })))?;
        let browse_id = parse_lyrics_browse_id(&next);
        if browse_id.is_empty() {
            return Ok(Lyrics {
                message: "Letra não disponível".into(),
                ..Lyrics::default()
            });
        }
        let payload = self.call(
            BROWSE,
            request_body(BROWSE, json!({ "browseId": browse_id })),
        )?;
        parse_lyrics(&payload)
    }

    pub fn queue(&self, video_id: &str, playlist_id: &str) -> Result<Vec<Track>, String> {
        let mut params = serde_json::Map::new();
        if !video_id.is_empty() {
            params.insert("videoId".to_string(), json!(video_id));
        }
        if !playlist_id.is_empty() {
            params.insert("playlistId".to_string(), json!(playlist_id));
        }
        let payload = self.call(NEXT, request_body(NEXT, Value::Object(params)))?;
        parse_queue(&payload)
    }

    pub fn stream(&self, video_id: &str) -> Result<Stream, String> {
        self.stream_variant(video_id, None)
    }

    /// `variant`: `None` = muxed itag 18 when present, `webm` = Opus,
    /// `muxed` = progressive MP4. ANDROID is tried first because it ships
    /// itag 18 with a direct URL; IOS is the fallback that only has DASH audio.
    pub fn stream_variant(&self, video_id: &str, variant: Option<&str>) -> Result<Stream, String> {
        let container = if variant == Some("webm") {
            Some("webm")
        } else {
            None
        };
        let mut last_error = None;
        for kind in [ClientKind::Android, ClientKind::Ios] {
            let body = request_body_for(kind, json!({ "videoId": video_id }));
            match self.call_as(kind, PLAYER, body) {
                Ok(payload) => match parse_stream_with(&payload, container) {
                    Ok(mut stream) => match playback_source(&stream, variant) {
                        Ok((url, mime, itag)) => {
                            stream.audio_url = url;
                            stream.mime_type = mime;
                            stream.itag = itag;
                            return Ok(stream);
                        }
                        Err(error) => last_error = Some(error),
                    },
                    Err(error) => last_error = Some(error),
                },
                Err(error) => last_error = Some(error),
            }
        }
        Err(last_error.unwrap_or_else(|| format!("player \"{video_id}\" failed")))
    }

    /// Resolves a fresh googlevideo URL and opens it with the caller's Range
    /// header, so the proxy can seek without buffering the whole track.
    pub fn suggestions(&self, input: &str) -> Result<Vec<String>, String> {
        let body = request_body(SUGGESTIONS, json!({ "input": input }));
        let payload = self.call(SUGGESTIONS, body)?;
        parse_suggestions(&payload)
    }

    pub fn guide(&self) -> Result<Vec<GuideEntry>, String> {
        let payload = self.call(GUIDE, request_body(GUIDE, json!({})))?;
        parse_guide(&payload)
    }

    pub fn account(&self) -> Result<Account, String> {
        let payload = self.call(ACCOUNT_MENU, request_body(ACCOUNT_MENU, json!({})))?;
        parse_account(&payload)
    }

    /// Google account email lives on ListAccounts, not Innertube account_menu.
    pub fn listed_accounts(&self) -> Result<Vec<Account>, String> {
        let Some(credentials) = &self.credentials else {
            return Ok(Vec::new());
        };
        if credentials.identity_cookies.is_empty() {
            if credentials.email.is_empty() && credentials.display_name.is_empty() {
                return Ok(Vec::new());
            }
            return Ok(vec![Account {
                display_name: credentials.display_name.clone(),
                email: credentials.email.clone(),
                ..Account::default()
            }]);
        }
        let response = self
            .http
            .post(LIST_ACCOUNTS_URL)
            .header("content-type", "application/x-www-form-urlencoded")
            .header("origin", "https://ogs.google.com")
            .header("referer", "https://ogs.google.com/")
            .header("user-agent", USER_AGENT)
            .header("cookie", credentials.identity_cookies.clone())
            .body("gpsia=1&source=ogb&json=standard")
            .send()
            .map_err(|error| format!("POST ListAccounts failed: {error}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "POST ListAccounts returned HTTP {}",
                status.as_u16()
            ));
        }
        let payload = response
            .json::<Value>()
            .map_err(|error| format!("POST ListAccounts returned invalid JSON: {error}"))?;
        parse_list_account_rows(&payload)
    }

    pub fn listed_account(&self) -> Result<Account, String> {
        Ok(self
            .listed_accounts()?
            .into_iter()
            .next()
            .unwrap_or_default())
    }

    /// Downloads the whole track in 1 MiB windows (the CDN rejects bigger
    /// spans) so the proxy can serve seekable byte ranges from memory.
    pub fn fetch_media(
        &self,
        video_id: &str,
        variant: Option<&str>,
    ) -> Result<(Stream, Vec<u8>), String> {
        // The CDN rejects windows above ~256 KiB on throttled nodes
        // (probed 2026-11-05).
        const WINDOWS: [u64; 3] = [256 * 1024, 64 * 1024, 16 * 1024];
        let mut stream = self.stream_variant(video_id, variant)?;
        let (media_url, mime, itag) = playback_source(&stream, variant)?;
        stream.audio_url = media_url.clone();
        stream.mime_type = mime;
        stream.itag = itag;
        let mut data: Vec<u8> = Vec::new();
        let mut offset: u64 = 0;
        let mut stalls = 0;
        loop {
            // The CDN throttles bursts: pace the windows and back off on 403.
            std::thread::sleep(Duration::from_millis(120));
            let mut response = None;
            let mut last_status = 0;
            for size in WINDOWS {
                let range = format!("bytes={offset}-{}", offset + size - 1);
                // googlevideo POSTs in the live client have no Cookie; sending
                // the SAPISID jar is unnecessary and the Range header is what
                // turns a 403 into a 206 on DASH URLs (probed 2026-11-05).
                let candidate = self
                    .http
                    .get(&media_url)
                    .header("user-agent", ANDROID_USER_AGENT)
                    .header("range", &range)
                    .send()
                    .map_err(|error| format!("GET media {video_id} failed: {error}"))?;
                let status = candidate.status();
                if status.as_u16() == 403 {
                    last_status = 403;
                    continue;
                }
                response = Some(candidate);
                break;
            }
            let Some(response) = response else {
                if last_status == 403 && stalls < 4 {
                    stalls += 1;
                    std::thread::sleep(Duration::from_millis(800 * stalls as u64));
                    continue;
                }
                return Err(format!(
                    "GET media {video_id} returned HTTP {last_status} for every window"
                ));
            };
            stalls = 0;
            let status = response.status();
            if status.as_u16() == 416 {
                break;
            }
            if !status.is_success() {
                return Err(format!(
                    "GET media {video_id} returned HTTP {}",
                    status.as_u16()
                ));
            }
            let total = response
                .headers()
                .get("content-range")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.rsplit('/').next())
                .and_then(|value| value.parse::<u64>().ok());
            let chunk = response
                .bytes()
                .map_err(|error| format!("read media {video_id}: {error}"))?;
            if chunk.is_empty() {
                break;
            }
            data.extend_from_slice(&chunk);
            offset += chunk.len() as u64;
            if let Some(total) = total {
                if offset >= total {
                    break;
                }
            }
        }
        if data.is_empty() {
            return Err(format!("media for \"{video_id}\" came back empty"));
        }
        Ok((stream, data))
    }

    fn call(&self, endpoint: &str, body: Value) -> Result<Value, String> {
        self.call_as(client_kind_for(endpoint), endpoint, body)
    }

    fn call_as(&self, kind: ClientKind, endpoint: &str, body: Value) -> Result<Value, String> {
        let url = format!("{}{endpoint}?prettyPrint=false", self.base_url);
        let mut request = self
            .http
            .post(&url)
            .header("content-type", "application/json")
            .header("user-agent", user_agent_for(kind))
            .json(&body);
        if let Some(credentials) = &self.credentials {
            request = request.header("cookie", credentials.cookies.clone());
            if signs_with_sapisid(kind) {
                request = request
                    .header(
                        "authorization",
                        credentials.authorization(crate::session::now_epoch()),
                    )
                    .header("x-goog-authuser", "0")
                    .header("origin", ORIGIN)
                    .header("referer", format!("{ORIGIN}/"));
            }
        }
        let response = request
            .send()
            .map_err(|error| format!("POST {endpoint} failed: {error}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("POST {endpoint} returned HTTP {}", status.as_u16()));
        }
        response
            .json::<Value>()
            .map_err(|error| format!("POST {endpoint} returned invalid JSON: {error}"))
    }
}
