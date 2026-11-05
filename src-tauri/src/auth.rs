//! Google OAuth device flow (the one YouTube TV uses) so the app can read the
//! signed-in library. Tokens live in a 0600 JSON file inside the app config
//! dir — the same rule as the other local tools (no Keychain prompts).

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const CLIENT_ID: &str =
    "861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com";
pub const SCOPE: &str = "https://www.googleapis.com/auth/youtube";
/// The TV client is a "confidential" OAuth client: Google rejects the token
/// exchange without this secret (`invalid_request: Missing ... client_secret`).
pub const CLIENT_SECRET: &str = "SboVhoG9s0rNafixCSGGKXAT";
pub const DEVICE_CODE_URL: &str = "https://oauth2.googleapis.com/device/code";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// Refresh a minute early so a request never leaves with an expired token.
pub const REFRESH_MARGIN_SECS: i64 = 60;
pub const TOKEN_FILE: &str = "auth.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStart {
    pub device_code: String,
    pub user_code: String,
    pub verification_url: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokenSet {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PollOutcome {
    Pending,
    SlowDown,
    Token(TokenSet),
}

pub fn parse_device_start(raw: &Value) -> Result<DeviceStart, String> {
    let text = |field: &str| {
        raw.get(field)
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| format!("device code response without \"{field}\": {raw}"))
    };
    Ok(DeviceStart {
        device_code: text("device_code")?,
        user_code: text("user_code")?,
        verification_url: text("verification_url")?,
        expires_in: raw.get("expires_in").and_then(Value::as_u64).unwrap_or(1800),
        interval: raw.get("interval").and_then(Value::as_u64).unwrap_or(5),
    })
}

pub fn parse_poll(
    raw: &Value,
    now: i64,
    previous_refresh: Option<&str>,
) -> Result<PollOutcome, String> {
    if let Some(code) = raw.get("error").and_then(Value::as_str) {
        return match code {
            "authorization_pending" => Ok(PollOutcome::Pending),
            "slow_down" => Ok(PollOutcome::SlowDown),
            other => Err(format!("google oauth error \"{other}\": {raw}")),
        };
    }
    let access_token = raw
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("token response without \"access_token\": {raw}"))?;
    let refresh_token = raw
        .get("refresh_token")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| previous_refresh.map(str::to_string))
        .ok_or_else(|| format!("token response without \"refresh_token\": {raw}"))?;
    let expires_in = raw.get("expires_in").and_then(Value::as_i64).unwrap_or(0);
    Ok(PollOutcome::Token(TokenSet {
        access_token: access_token.to_string(),
        refresh_token,
        expires_at: now + expires_in,
    }))
}

pub fn needs_refresh(expires_at: i64, now: i64) -> bool {
    expires_at - REFRESH_MARGIN_SECS <= now
}

pub fn auth_header(token: &str) -> String {
    format!("Bearer {token}")
}

pub fn token_path(dir: &Path) -> PathBuf {
    dir.join(TOKEN_FILE)
}

pub fn save_tokens(dir: &Path, tokens: &TokenSet) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| format!("create {}: {error}", dir.display()))?;
    let path = token_path(dir);
    let json = serde_json::to_string_pretty(tokens)
        .map_err(|error| format!("serialize tokens: {error}"))?;
    write_private(&path, &json)
        .map_err(|error| format!("write {}: {error}", path.display()))
}

pub fn load_tokens(dir: &Path) -> Option<TokenSet> {
    let raw = fs::read_to_string(token_path(dir)).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Kicks off the device flow: the user types `user_code` on
/// `verification_url` and the app polls the token endpoint.
pub fn start_device_flow() -> Result<DeviceStart, String> {
    let response = http()?
        .post(DEVICE_CODE_URL)
        .form(&[("client_id", CLIENT_ID), ("scope", SCOPE)])
        .send()
        .map_err(|error| format!("POST device/code failed: {error}"))?;
    let status = response.status();
    let payload: Value = response
        .json()
        .map_err(|error| format!("decode device/code: {error}"))?;
    if !status.is_success() {
        return Err(format!("device/code returned HTTP {}: {payload}", status.as_u16()));
    }
    parse_device_start(&payload)
}

pub fn device_token_form(device_code: &str) -> Vec<(&'static str, String)> {
    vec![
        ("client_id", CLIENT_ID.to_string()),
        ("client_secret", CLIENT_SECRET.to_string()),
        ("device_code", device_code.to_string()),
        (
            "grant_type",
            "urn:ietf:params:oauth:grant-type:device_code".to_string(),
        ),
    ]
}

pub fn refresh_form(refresh_token: &str) -> Vec<(&'static str, String)> {
    vec![
        ("client_id", CLIENT_ID.to_string()),
        ("client_secret", CLIENT_SECRET.to_string()),
        ("refresh_token", refresh_token.to_string()),
        ("grant_type", "refresh_token".to_string()),
    ]
}

pub fn poll_device_flow(device_code: &str) -> Result<PollOutcome, String> {
    let response = http()?
        .post(TOKEN_URL)
        .form(&device_token_form(device_code))
        .send()
        .map_err(|error| format!("POST token failed: {error}"))?;
    let payload: Value = response
        .json()
        .map_err(|error| format!("decode token: {error}"))?;
    parse_poll(&payload, now_epoch(), None)
}

pub fn refresh(refresh_token: &str) -> Result<PollOutcome, String> {
    let response = http()?
        .post(TOKEN_URL)
        .form(&refresh_form(refresh_token))
        .send()
        .map_err(|error| format!("POST refresh failed: {error}"))?;
    let payload: Value = response
        .json()
        .map_err(|error| format!("decode refresh: {error}"))?;
    parse_poll(&payload, now_epoch(), Some(refresh_token))
}

pub fn now_epoch() -> i64 {
    crate::session::now_epoch()
}

fn http() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("build oauth http client: {error}"))
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
