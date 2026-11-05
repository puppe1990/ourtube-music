//! Browser-cookie authentication (SAPISIDHASH). Google restricted the TV OAuth
//! device flow for the music endpoints in Aug/2025 — every authenticated call
//! answers 400 INVALID_ARGUMENT (sigma67/ytmusicapi#813) — so the app uses the
//! same scheme as the web player: the `SAPISID` cookie signs each request.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

pub const ORIGIN: &str = "https://music.youtube.com";

/// Only the YouTube/Google session cookies are forwarded. Sending the whole
/// jar — especially the `__Host-*` entries — makes Innertube treat the request
/// as anonymous (probed 2026-11-05).
pub const AUTH_COOKIE_NAMES: [&str; 12] = [
    "SID",
    "HSID",
    "SSID",
    "APISID",
    "SAPISID",
    "__Secure-1PSID",
    "__Secure-3PSID",
    "__Secure-1PAPISID",
    "__Secure-3PAPISID",
    "SIDCC",
    "__Secure-1PSIDCC",
    "__Secure-3PSIDCC",
];
pub const CREDENTIALS_FILE: &str = "credentials.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CookieAuth {
    /// Full `Cookie:` header built from the signed-in browser session.
    pub cookies: String,
    /// Value of the `SAPISID` (or `__Secure-3PAPISID`) cookie.
    pub sapisid: String,
}

impl CookieAuth {
    pub fn authorization(&self, timestamp: i64) -> String {
        sapisid_hash(&self.sapisid, timestamp)
    }
}

/// `SAPISIDHASH <ts>_<sha1(ts + " " + sapisid + " " + origin)>`.
pub fn sapisid_hash(sapisid: &str, timestamp: i64) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("{timestamp} {sapisid} {ORIGIN}").as_bytes());
    format!("SAPISIDHASH {timestamp}_{:x}", hasher.finalize())
}

pub fn cookie_header(pairs: &[(String, String)]) -> String {
    let mut seen: Vec<&str> = Vec::new();
    let mut header = Vec::new();
    for (name, value) in pairs {
        if !AUTH_COOKIE_NAMES.contains(&name.as_str()) || seen.contains(&name.as_str()) {
            continue;
        }
        seen.push(name);
        header.push(format!("{name}={value}"));
    }
    header.join("; ")
}

/// Picks the signing cookie out of a session dump. `SAPISID` is preferred;
/// `__Secure-3PAPISID` carries the same secret when the plain one is absent.
pub fn extract_cookie_auth(pairs: &[(String, String)]) -> Option<CookieAuth> {
    let sapisid = pairs
        .iter()
        .find(|(name, _)| name == "SAPISID")
        .or_else(|| pairs.iter().find(|(name, _)| name == "__Secure-3PAPISID"))
        .map(|(_, value)| value.clone())?;
    if sapisid.is_empty() {
        return None;
    }
    Some(CookieAuth {
        cookies: cookie_header(pairs),
        sapisid,
    })
}

pub fn credential_path(dir: &Path) -> PathBuf {
    dir.join(CREDENTIALS_FILE)
}

pub fn save_credentials(dir: &Path, auth: &CookieAuth) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| format!("create {}: {error}", dir.display()))?;
    let path = credential_path(dir);
    let json = serde_json::to_string_pretty(auth)
        .map_err(|error| format!("serialize credentials: {error}"))?;
    write_private(&path, &json).map_err(|error| format!("write {}: {error}", path.display()))
}

pub fn load_credentials(dir: &Path) -> Option<CookieAuth> {
    let raw = fs::read_to_string(credential_path(dir)).ok()?;
    serde_json::from_str(&raw).ok()
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
