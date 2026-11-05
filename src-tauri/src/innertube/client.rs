use std::io::Read;
use std::time::Duration;

use serde_json::{json, Value};

use crate::innertube::endpoints::{
    ACCOUNT_MENU, BASE_URL, BROWSE, ClientKind, GUIDE, IOS_CLIENT_NAME, IOS_CLIENT_VERSION,
    IOS_DEVICE_MODEL, IOS_OS_VERSION, LOCALE, NEXT, PLAYER, REGION, SEARCH, SUGGESTIONS,
    USER_AGENT, WEB_CLIENT_NAME, WEB_CLIENT_VERSION,
};
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
    let kind = client_kind_for(endpoint);
    let mut body = match params {
        Value::Object(params) => params,
        _ => serde_json::Map::new(),
    };
    body.insert("context".to_string(), client_context(kind));
    if kind == ClientKind::Ios {
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
    }
}

/// Streaming body for the localhost audio proxy; the caller copies `body` into
/// the client socket while the response headers stay untouched.
pub struct AudioResponse {
    pub status: u16,
    pub content_type: String,
    pub content_length: Option<u64>,
    pub content_range: Option<String>,
    pub body: Box<dyn Read + Send>,
}

pub struct MusicClient {
    base_url: String,
    http: reqwest::blocking::Client,
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
        }
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
        self.stream_with(video_id, None)
    }

    pub fn stream_with(&self, video_id: &str, container: Option<&str>) -> Result<Stream, String> {
        let payload = self.call(PLAYER, request_body(PLAYER, json!({ "videoId": video_id })))?;
        parse_stream_with(&payload, container)
    }

    /// Resolves a fresh googlevideo URL and opens it with the caller's Range
    /// header, so the proxy can seek without buffering the whole track.
    pub fn open_audio(
        &self,
        video_id: &str,
        container: Option<&str>,
        range: Option<&str>,
    ) -> Result<AudioResponse, String> {
        let stream = self.stream_with(video_id, container)?;
        let mut request = self.http.get(&stream.audio_url).header("user-agent", USER_AGENT);
        if let Some(range) = range {
            request = request.header("range", range);
        }
        let response = request
            .send()
            .map_err(|error| format!("GET audio {video_id} failed: {error}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("GET audio {video_id} returned HTTP {}", status.as_u16()));
        }
        let header = |name: &str| {
            response
                .headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .map(str::to_string)
        };
        Ok(AudioResponse {
            status: status.as_u16(),
            content_type: header("content-type").unwrap_or_else(|| "audio/mp4".to_string()),
            content_length: header("content-length").and_then(|value| value.parse().ok()),
            content_range: header("content-range"),
            body: Box::new(response),
        })
    }

    pub fn suggestions(&self, input: &str) -> Result<Vec<String>, String> {
        let payload = self.call(
            SUGGESTIONS,
            request_body(SUGGESTIONS, json!({ "input": input })),
        )?;
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

    fn call(&self, endpoint: &str, body: Value) -> Result<Value, String> {
        let url = format!("{}{endpoint}?prettyPrint=false", self.base_url);
        let response = self
            .http
            .post(&url)
            .header("content-type", "application/json")
            .header("user-agent", USER_AGENT)
            .json(&body)
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
