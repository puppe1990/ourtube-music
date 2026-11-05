use std::time::Duration;

use serde_json::{json, Value};

use crate::innertube::endpoints::{
    ACCOUNT_MENU, BASE_URL, BROWSE, ClientKind, GUIDE, IOS_CLIENT_NAME, IOS_CLIENT_VERSION,
    IOS_DEVICE_MODEL, IOS_OS_VERSION, LOCALE, NEXT, PLAYER, REGION, SEARCH, SUGGESTIONS,
    USER_AGENT, VR_ANDROID_SDK, VR_CLIENT_NAME, VR_CLIENT_VERSION, VR_DEVICE_MAKE, VR_DEVICE_MODEL,
    VR_OS_VERSION, VR_USER_AGENT, WEB_CLIENT_NAME, WEB_CLIENT_VERSION,
};
use crate::auth::{CookieAuth, ORIGIN};
use crate::innertube::models::{Account, GuideEntry, Shelf, Stream, Track};
use crate::innertube::parsers::{
    parse_account, parse_guide, parse_home_shelves, parse_queue, parse_search_results,
    parse_stream_with, parse_suggestions,
};

pub const HOME_BROWSE_IDS: [&str; 2] = ["FEmusic_home", "FEmusic_explore"];

/// Only /player needs IOS; the browsing endpoints keep the web client so the
/// payloads match the ones the music web app renders.
pub fn client_kind_for(endpoint: &str) -> ClientKind {
    if endpoint == PLAYER {
        ClientKind::Ios
    } else {
        ClientKind::WebRemix
    }
}

pub fn request_body(endpoint: &str, params: Value) -> Value {
    request_body_for(client_kind_for(endpoint), params)
}

pub fn request_body_for(kind: ClientKind, params: Value) -> Value {
    let mut body = match params {
        Value::Object(params) => params,
        _ => serde_json::Map::new(),
    };
    body.insert("context".to_string(), client_context(kind));
    if kind != ClientKind::WebRemix {
        body.entry("contentCheckOk".to_string()).or_insert(json!(true));
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
    pub fn home(&self) -> Result<Vec<Shelf>, String> {
        let mut last_error = None;
        for browse_id in HOME_BROWSE_IDS {
            match self.browse(browse_id) {
                Ok(shelves) if !shelves.is_empty() => return Ok(shelves),
                Ok(_) => continue,
                Err(error) => last_error = Some(error),
            }
        }
        match last_error {
            Some(error) => Err(error),
            None => Ok(Vec::new()),
        }
    }

    fn browse(&self, browse_id: &str) -> Result<Vec<Shelf>, String> {
        let body = request_body(BROWSE, json!({ "browseId": browse_id }));
        let payload = self.call(BROWSE, body)?;
        parse_home_shelves(&payload)
    }

    pub fn search(&self, query: &str) -> Result<Vec<Track>, String> {
        let payload = self.call(SEARCH, request_body(SEARCH, json!({ "query": query })))?;
        parse_search_results(&payload)
    }

    pub fn queue(&self, video_id: &str) -> Result<Vec<Track>, String> {
        let payload = self.call(NEXT, request_body(NEXT, json!({ "videoId": video_id })))?;
        parse_queue(&payload)
    }

    pub fn stream(&self, video_id: &str) -> Result<Stream, String> {
        self.stream_variant(video_id, None)
    }

    /// `variant`: `None` = adaptive audio, `webm` = Opus, `muxed` = progressive
    /// MP4 (itag 18). IOS is tried first because it answers without the bot
    /// check; ANDROID_VR is the fallback that also ships the muxed format.
    pub fn stream_variant(&self, video_id: &str, variant: Option<&str>) -> Result<Stream, String> {
        let container = if variant == Some("webm") { Some("webm") } else { None };
        let mut last_error = None;
        for kind in [ClientKind::Ios, ClientKind::AndroidVr] {
            let body = request_body_for(kind, json!({ "videoId": video_id }));
            match self.call(PLAYER, body) {
                Ok(payload) => match parse_stream_with(&payload, container) {
                    Ok(mut stream) => {
                        if variant == Some("muxed") {
                            if stream.fallback_url.is_empty() {
                                return Err(format!(
                                    "player \"{video_id}\" has no progressive format"
                                ));
                            }
                            stream.audio_url = stream.fallback_url.clone();
                            stream.mime_type = stream.fallback_mime.clone();
                            stream.itag = stream.fallback_itag;
                        }
                        return Ok(stream);
                    }
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
        let stream = self.stream_variant(video_id, variant)?;
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
                let mut candidate = self
                    .http
                    .get(&stream.audio_url)
                    .header("user-agent", USER_AGENT)
                    .header("range", range);
                if let Some(credentials) = &self.credentials {
                    candidate = candidate.header("cookie", credentials.cookies.clone());
                }
                let candidate = candidate
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
                return Err(format!("GET media {video_id} returned HTTP {}", status.as_u16()));
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
        let url = format!("{}{endpoint}?prettyPrint=false", self.base_url);
        let mut request = self
            .http
            .post(&url)
            .header("content-type", "application/json")
            .header(
                "user-agent",
                if client_kind_for(endpoint) == ClientKind::AndroidVr {
                    VR_USER_AGENT
                } else {
                    USER_AGENT
                },
            )
            .json(&body);
        if let Some(credentials) = &self.credentials {
            request = request
                .header("cookie", credentials.cookies.clone())
                .header(
                    "authorization",
                    credentials.authorization(crate::session::now_epoch()),
                )
                .header("x-goog-authuser", "0")
                .header("origin", ORIGIN)
                .header("referer", format!("{ORIGIN}/"));
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
