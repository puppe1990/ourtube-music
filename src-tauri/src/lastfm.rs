//! Last.fm desktop auth + scrobble. Session lives in `lastfm.json` next to
//! `credentials.json`. The API secret never goes to the webview: JS only sends
//! track metadata; this module signs `api_sig` (MD5, Last.fm authspec).

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};

const LASTFM_API: &str = "https://ws.audioscrobbler.com/2.0/";
const LASTFM_FILE: &str = "lastfm.json";
const MIN_DURATION_SEC: f64 = 30.0;
const MAX_LISTEN_SEC: f64 = 240.0;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastFmStore {
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub api_secret: String,
    #[serde(default)]
    pub session_key: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub pending_token: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastFmState {
    pub connected: bool,
    pub username: String,
    pub pending: bool,
    pub has_keys: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub auth_url: String,
}

pub struct LastFmSession {
    dir: PathBuf,
    store: Mutex<LastFmStore>,
}

impl LastFmSession {
    pub fn load(dir: PathBuf) -> Self {
        let store = load_store(&dir).unwrap_or_default();
        Self {
            dir,
            store: Mutex::new(store),
        }
    }

    fn locked_store(&self) -> std::sync::MutexGuard<'_, LastFmStore> {
        self.store.lock().expect("lastfm lock")
    }

    fn refresh_store(&self) {
        if let Ok(loaded) = load_store(&self.dir) {
            *self.locked_store() = loaded;
        }
    }

    pub fn view(&self) -> LastFmState {
        self.refresh_store();
        view_of(&self.locked_store())
    }

    pub fn login(&self) -> Result<LastFmState, String> {
        self.refresh_store();
        let (api_key, secret) = require_keys(&self.locked_store())?;
        let payload = lastfm_call(
            map_of(&[("method", "auth.getToken"), ("api_key", &api_key)]),
            &secret,
        )?;
        let token = payload
            .get("token")
            .and_then(|value| value.as_str())
            .ok_or_else(|| "Last.fm não devolveu um token".to_string())?
            .to_string();
        {
            let mut store = self.locked_store();
            store.pending_token = token.clone();
            store.session_key.clear();
            store.username.clear();
            save_store(&self.dir, &store)?;
        }
        let auth_url = lastfm_auth_url(&api_key, &token);
        open_lastfm_auth(&auth_url)?;
        let mut state = self.view();
        state.auth_url = auth_url;
        state.pending = true;
        Ok(state)
    }

    pub fn complete(&self) -> Result<LastFmState, String> {
        self.refresh_store();
        let (token, api_key, secret) = {
            let store = self.locked_store();
            if store.pending_token.is_empty() {
                return Ok(view_of(&store));
            }
            let (api_key, secret) = require_keys(&store)?;
            (store.pending_token.clone(), api_key, secret)
        };
        let payload = match lastfm_call(
            map_of(&[
                ("method", "auth.getSession"),
                ("api_key", &api_key),
                ("token", &token),
            ]),
            &secret,
        ) {
            Ok(payload) => payload,
            Err(error) if is_token_pending(&error) => {
                let mut state = self.view();
                state.pending = true;
                return Ok(state);
            }
            Err(error) => return Err(error),
        };
        let session = payload
            .get("session")
            .ok_or_else(|| format!("last.fm session missing in {}", payload))?;
        let key = session
            .get("key")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let name = session
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        {
            let mut store = self.locked_store();
            store.session_key = key;
            store.username = name;
            store.pending_token.clear();
            save_store(&self.dir, &store)?;
        }
        Ok(self.view())
    }

    pub fn logout(&self) -> Result<LastFmState, String> {
        self.refresh_store();
        let mut store = self.locked_store();
        store.session_key.clear();
        store.username.clear();
        store.pending_token.clear();
        save_store(&self.dir, &store)?;
        Ok(view_of(&store))
    }

    pub fn update_now_playing(&self, args: &ScrobbleTrack) -> Result<(), String> {
        self.refresh_store();
        let (sk, api_key, secret) = session_creds(&self.locked_store())?;
        if sk.is_empty() {
            return Ok(());
        }
        let mut params = map_of(&[
            ("method", "track.updateNowPlaying"),
            ("api_key", &api_key),
            ("sk", &sk),
            ("artist", &args.artist),
            ("track", &args.track),
        ]);
        insert_optional(&mut params, "album", &args.album);
        insert_duration(&mut params, "duration", args.duration);
        lastfm_call(params, &secret)?;
        Ok(())
    }

    pub fn scrobble(&self, args: &ScrobbleTrack) -> Result<(), String> {
        self.refresh_store();
        let (sk, api_key, secret) = session_creds(&self.locked_store())?;
        if sk.is_empty() {
            return Ok(());
        }
        let timestamp = args.timestamp.unwrap_or(0).to_string();
        let mut params = map_of(&[
            ("method", "track.scrobble"),
            ("api_key", &api_key),
            ("sk", &sk),
            ("artist[0]", &args.artist),
            ("track[0]", &args.track),
            ("timestamp[0]", &timestamp),
        ]);
        insert_optional(&mut params, "album[0]", &args.album);
        insert_duration(&mut params, "duration[0]", args.duration);
        lastfm_call(params, &secret)?;
        Ok(())
    }
}

#[derive(Debug, Default, Deserialize)]
pub struct ScrobbleTrack {
    pub artist: String,
    pub track: String,
    pub album: Option<String>,
    pub duration: Option<f64>,
    pub timestamp: Option<i64>,
}

pub fn api_signature(params: &BTreeMap<String, String>, secret: &str) -> String {
    let mut concat = String::new();
    for (key, value) in params {
        if key == "format" || key == "callback" || key == "api_sig" {
            continue;
        }
        concat.push_str(key);
        concat.push_str(value);
    }
    concat.push_str(secret);
    format!("{:x}", Md5::digest(concat.as_bytes()))
}

pub fn lastfm_auth_url(api_key: &str, token: &str) -> String {
    format!("https://www.last.fm/api/auth/?api_key={api_key}&token={token}")
}

pub fn allowed_lastfm_auth_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    let host = parsed.host_str().unwrap_or_default();
    if host != "www.last.fm" && host != "last.fm" {
        return false;
    }
    parsed.path() == "/api/auth" || parsed.path() == "/api/auth/"
}

pub fn should_scrobble(duration_sec: f64, played_sec: f64) -> bool {
    if !duration_sec.is_finite() || duration_sec <= MIN_DURATION_SEC {
        return false;
    }
    if !played_sec.is_finite() || played_sec < 0.0 {
        return false;
    }
    played_sec >= duration_sec.half_min(MAX_LISTEN_SEC)
}

trait HalfMin {
    fn half_min(self, cap: f64) -> f64;
}

impl HalfMin for f64 {
    fn half_min(self, cap: f64) -> f64 {
        (self / 2.0).min(cap)
    }
}

pub fn missing_keys_error() -> String {
    "Crie um app em https://www.last.fm/api/account/create e coloque LASTFM_API_KEY e LASTFM_API_SECRET no ambiente, ou em lastfm.json na pasta de configuração do OurTube Music.".to_string()
}

pub fn resolve_key(file_value: &str, env_value: Option<&str>) -> String {
    match env_value {
        Some(value) if !value.is_empty() => value.to_string(),
        _ => file_value.to_string(),
    }
}

pub fn lastfm_path(dir: &Path) -> PathBuf {
    dir.join(LASTFM_FILE)
}

pub fn save_store(dir: &Path, store: &LastFmStore) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| format!("create {}: {error}", dir.display()))?;
    let json = serde_json::to_string_pretty(store)
        .map_err(|error| format!("serialize lastfm: {error}"))?;
    write_private(&lastfm_path(dir), &json)
        .map_err(|error| format!("write {}: {error}", lastfm_path(dir).display()))
}

pub fn load_store(dir: &Path) -> Result<LastFmStore, String> {
    let path = lastfm_path(dir);
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LastFmStore::default());
        }
        Err(error) => return Err(format!("read {}: {error}", path.display())),
    };
    serde_json::from_str(&raw).map_err(|error| format!("parse {}: {error}", path.display()))
}

fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)?;
        file.write_all(contents.as_bytes())
    }
    #[cfg(not(unix))]
    {
        fs::write(path, contents)
    }
}

fn env_opt(name: &str) -> Option<String> {
    match std::env::var(name) {
        Ok(value) if !value.is_empty() => Some(value),
        _ => None,
    }
}

fn api_credentials(store: &LastFmStore) -> (String, String) {
    (
        resolve_key(&store.api_key, env_opt("LASTFM_API_KEY").as_deref()),
        resolve_key(&store.api_secret, env_opt("LASTFM_API_SECRET").as_deref()),
    )
}

fn require_keys(store: &LastFmStore) -> Result<(String, String), String> {
    let (api_key, secret) = api_credentials(store);
    if api_key.is_empty() || secret.is_empty() {
        return Err(missing_keys_error());
    }
    Ok((api_key, secret))
}

fn session_creds(store: &LastFmStore) -> Result<(String, String, String), String> {
    let (api_key, secret) = api_credentials(store);
    Ok((store.session_key.clone(), api_key, secret))
}

fn view_of(store: &LastFmStore) -> LastFmState {
    let (api_key, secret) = api_credentials(store);
    LastFmState {
        connected: !store.session_key.is_empty() && !store.username.is_empty(),
        username: store.username.clone(),
        pending: !store.pending_token.is_empty() && store.session_key.is_empty(),
        has_keys: !api_key.is_empty() && !secret.is_empty(),
        auth_url: String::new(),
    }
}

fn map_of(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
        .collect()
}

fn insert_optional(params: &mut BTreeMap<String, String>, key: &str, value: &Option<String>) {
    if let Some(text) = value {
        if !text.is_empty() {
            params.insert(key.to_string(), text.clone());
        }
    }
}

fn insert_duration(params: &mut BTreeMap<String, String>, key: &str, duration: Option<f64>) {
    if let Some(value) = duration {
        if value.is_finite() && value > 0.0 {
            params.insert(key.to_string(), (value.floor() as i64).to_string());
        }
    }
}

fn is_token_pending(error: &str) -> bool {
    error.contains("last.fm 14:")
}

fn lastfm_call(
    mut params: BTreeMap<String, String>,
    secret: &str,
) -> Result<serde_json::Value, String> {
    let signature = api_signature(&params, secret);
    params.insert("api_sig".to_string(), signature);
    params.insert("format".to_string(), "json".to_string());
    let response = reqwest::blocking::Client::new()
        .post(LASTFM_API)
        .form(&params)
        .send()
        .map_err(|error| format!("last.fm http: {error}"))?;
    let payload: serde_json::Value = response
        .json()
        .map_err(|error| format!("last.fm json: {error}"))?;
    if let Some(code) = payload.get("error").and_then(|value| value.as_i64()) {
        let message = payload
            .get("message")
            .and_then(|value| value.as_str())
            .unwrap_or("Last.fm error");
        return Err(format!("last.fm {code}: {message}"));
    }
    Ok(payload)
}

pub fn open_lastfm_auth(url: &str) -> Result<(), String> {
    if !allowed_lastfm_auth_url(url) {
        return Err(format!("last.fm auth url rejected: {url}"));
    }
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg(url).status();
    #[cfg(not(target_os = "macos"))]
    let status = std::process::Command::new("xdg-open").arg(url).status();
    status
        .map_err(|error| format!("open last.fm: {error}"))
        .and_then(|code| {
            if code.success() {
                Ok(())
            } else {
                Err(format!("open last.fm exited {code}"))
            }
        })
}

async fn lastfm_blocking<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("last.fm task failed: {error}"))?
}

#[tauri::command]
pub async fn lastfm_state(
    session: tauri::State<'_, Arc<LastFmSession>>,
) -> Result<LastFmState, String> {
    let session = Arc::clone(session.inner());
    lastfm_blocking(move || Ok(session.view())).await
}

#[tauri::command]
pub async fn lastfm_login(
    session: tauri::State<'_, Arc<LastFmSession>>,
) -> Result<LastFmState, String> {
    let session = Arc::clone(session.inner());
    lastfm_blocking(move || session.login()).await
}

#[tauri::command]
pub async fn lastfm_complete(
    session: tauri::State<'_, Arc<LastFmSession>>,
) -> Result<LastFmState, String> {
    let session = Arc::clone(session.inner());
    lastfm_blocking(move || session.complete()).await
}

#[tauri::command]
pub async fn lastfm_logout(
    session: tauri::State<'_, Arc<LastFmSession>>,
) -> Result<LastFmState, String> {
    let session = Arc::clone(session.inner());
    lastfm_blocking(move || session.logout()).await
}

#[tauri::command]
pub async fn lastfm_now_playing(
    session: tauri::State<'_, Arc<LastFmSession>>,
    artist: String,
    track: String,
    album: Option<String>,
    duration: Option<f64>,
) -> Result<(), String> {
    let session = Arc::clone(session.inner());
    lastfm_blocking(move || {
        session.update_now_playing(&ScrobbleTrack {
            artist,
            track,
            album,
            duration,
            timestamp: None,
        })
    })
    .await
}

#[tauri::command]
pub async fn lastfm_scrobble(
    session: tauri::State<'_, Arc<LastFmSession>>,
    artist: String,
    track: String,
    album: Option<String>,
    duration: Option<f64>,
    timestamp: i64,
) -> Result<(), String> {
    let session = Arc::clone(session.inner());
    lastfm_blocking(move || {
        session.scrobble(&ScrobbleTrack {
            artist,
            track,
            album,
            duration,
            timestamp: Some(timestamp),
        })
    })
    .await
}
