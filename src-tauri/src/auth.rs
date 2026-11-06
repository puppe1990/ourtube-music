//! Browser-cookie authentication (SAPISIDHASH). Google restricted the TV OAuth
//! device flow for the music endpoints in Aug/2025 — every authenticated call
//! answers 400 INVALID_ARGUMENT (sigma67/ytmusicapi#813) — so the app uses the
//! same scheme as the web player: the `SAPISID` cookie signs each request.

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

pub const ORIGIN: &str = "https://music.youtube.com";

/// Only the YouTube/Google session cookies are forwarded. Sending the whole
/// jar — especially the `__Host-*` entries — makes Innertube treat the request
/// as anonymous (probed 2026-11-05).
pub const AUTH_COOKIE_NAMES: [&str; 20] = [
    "SID",
    "HSID",
    "SSID",
    "APISID",
    "SAPISID",
    "__Secure-1PSID",
    "__Secure-3PSID",
    "__Secure-1PAPISID",
    "__Secure-3PAPISID",
    "__Secure-1PSIDTS",
    "__Secure-3PSIDTS",
    "SIDCC",
    "__Secure-1PSIDCC",
    "__Secure-3PSIDCC",
    // Player/visitor state: without it /youtubei/v1/player answers
    // LOGIN_REQUIRED ("confirm you're not a bot") even when browse works.
    "VISITOR_INFO1_LIVE",
    "VISITOR_PRIVACY_METADATA",
    "PREF",
    "YSC",
    "__Secure-YEC",
    // SetSID on accounts.youtube.com writes this on .youtube.com; Google SID
    // alone keeps Innertube logged_in=0 (probed 2026-11-06).
    "LOGIN_INFO",
];
pub const CREDENTIALS_FILE: &str = "credentials.json";

/// Cookies that identify the Google account on `accounts.google.com`. They
/// must not go to Innertube (`__Host-*` made browse anonymous, probed
/// 2026-11-05) but `ListAccounts` needs them for the email.
pub const IDENTITY_COOKIE_NAMES: [&str; 5] = [
    "ACCOUNT_CHOOSER",
    "LSID",
    "__Host-GAPS",
    "__Host-1PLSID",
    "__Host-3PLSID",
];

pub const LIST_ACCOUNTS_URL: &str =
    "https://accounts.google.com/ListAccounts?gpsia=1&source=ogb&json=standard";

/// Google SID is not a YouTube Music session. This continue URL runs SetSID
/// and mints `.youtube.com` cookies (LOGIN_INFO / visitor). Needs identity
/// cookies on accounts.google.com (probed 2026-11-06).
pub const YOUTUBE_CONTINUE_URL: &str =
    "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F";

const HANDSHAKE_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct CookieAuth {
    /// Full `Cookie:` header built from the signed-in browser session.
    pub cookies: String,
    /// Value of the `SAPISID` (or `__Secure-3PAPISID`) cookie.
    pub sapisid: String,
    /// `accounts.google.com` jar for ListAccounts. Never sent to Innertube.
    #[serde(default)]
    pub identity_cookies: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub display_name: String,
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

pub fn identity_cookie_header(pairs: &[(String, String)]) -> String {
    let mut header = Vec::new();
    for name in IDENTITY_COOKIE_NAMES {
        if let Some((_, value)) = pairs.iter().find(|(cookie_name, _)| cookie_name == name) {
            if !value.is_empty() {
                header.push(format!("{name}={value}"));
            }
        }
    }
    header.join("; ")
}

pub fn parse_cookie_header(header: &str) -> Vec<(String, String)> {
    header
        .split(';')
        .filter_map(|part| {
            let part = part.trim();
            let (name, value) = part.split_once('=')?;
            if name.is_empty() {
                return None;
            }
            Some((name.to_string(), value.to_string()))
        })
        .collect()
}

pub fn youtube_session_ready(pairs: &[(String, String)]) -> bool {
    pairs.iter().any(|(name, value)| {
        (name == "LOGIN_INFO" || name == "VISITOR_INFO1_LIVE") && !value.is_empty()
    })
}

pub fn session_is_youtube_bound(auth: &CookieAuth) -> bool {
    youtube_session_ready(&parse_cookie_header(&auth.cookies))
}

pub fn handshake_cookie_header(auth: &CookieAuth) -> String {
    [auth.identity_cookies.as_str(), auth.cookies.as_str()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

fn set_cookies_include_login_info(set_cookies: &[String]) -> bool {
    set_cookies.iter().any(|line| {
        parse_set_cookie(line).is_some_and(|(name, value, expired)| {
            name == "LOGIN_INFO" && !value.is_empty() && !expired
        })
    })
}

/// Anonymous music.youtube.com HTML expires the Google SID. Only apply that
/// jar when LOGIN_INFO is present (signed-in HTML, probed 2026-11-06).
pub fn apply_login_info_cookies(auth: &CookieAuth, set_cookies: &[String]) -> CookieAuth {
    if !set_cookies_include_login_info(set_cookies) {
        return auth.clone();
    }
    apply_set_cookies(auth, set_cookies)
}

pub fn apply_set_cookies(auth: &CookieAuth, set_cookies: &[String]) -> CookieAuth {
    let mut innertube = map_from_pairs(&parse_cookie_header(&auth.cookies));
    let mut identity = map_from_pairs(&parse_cookie_header(&auth.identity_cookies));
    for line in set_cookies {
        let Some((name, value, expired)) = parse_set_cookie(line) else {
            continue;
        };
        let target = if IDENTITY_COOKIE_NAMES.contains(&name.as_str()) {
            &mut identity
        } else if AUTH_COOKIE_NAMES.contains(&name.as_str()) {
            &mut innertube
        } else {
            continue;
        };
        if expired || value.is_empty() {
            target.remove(&name);
        } else {
            target.insert(name, value);
        }
    }
    let innertube_pairs = pairs_from_map(&innertube);
    let sapisid = innertube_pairs
        .iter()
        .find(|(name, _)| name == "SAPISID")
        .or_else(|| {
            innertube_pairs
                .iter()
                .find(|(name, _)| name == "__Secure-3PAPISID")
        })
        .map(|(_, value)| value.clone())
        .unwrap_or_else(|| auth.sapisid.clone());
    CookieAuth {
        cookies: cookie_header(&innertube_pairs),
        sapisid,
        identity_cookies: identity_cookie_header(&pairs_from_map(&identity)),
        email: auth.email.clone(),
        display_name: auth.display_name.clone(),
    }
}

fn map_from_pairs(pairs: &[(String, String)]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for (name, value) in pairs {
        map.entry(name.clone()).or_insert_with(|| value.clone());
    }
    map
}

fn pairs_from_map(map: &HashMap<String, String>) -> Vec<(String, String)> {
    map.iter()
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect()
}

fn parse_set_cookie(line: &str) -> Option<(String, String, bool)> {
    let mut attrs = line.split(';').map(str::trim);
    let first = attrs.next()?;
    let (name, value) = first.split_once('=')?;
    if name.is_empty() {
        return None;
    }
    let mut expired = value.is_empty();
    for attr in attrs {
        let (key, attr_value) = attr.split_once('=').unwrap_or((attr, ""));
        if key.eq_ignore_ascii_case("max-age") {
            if attr_value.parse::<i64>().ok().is_some_and(|age| age <= 0) {
                expired = true;
            }
        }
    }
    Some((name.to_string(), value.to_string(), expired))
}

fn response_set_cookies(response: &reqwest::blocking::Response) -> Vec<String> {
    response
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|value| String::from_utf8_lossy(value.as_bytes()).into_owned())
        .collect()
}

fn mint_login_info(
    http: &reqwest::blocking::Client,
    auth: &CookieAuth,
) -> Result<CookieAuth, String> {
    let response = http
        .get(ORIGIN)
        .header("cookie", handshake_cookie_header(auth))
        .header("user-agent", HANDSHAKE_USER_AGENT)
        .header("accept", "text/html")
        .send()
        .map_err(|error| format!("youtube LOGIN_INFO mint failed: {error}"))?;
    Ok(apply_login_info_cookies(
        auth,
        &response_set_cookies(&response),
    ))
}

/// Follows ServiceLogin continue=music.youtube.com so Innertube sees a YouTube
/// session instead of a Google-only SID (probed 2026-11-06).
pub fn bind_youtube_session(auth: &CookieAuth) -> Result<CookieAuth, String> {
    if session_is_youtube_bound(auth) {
        return Ok(auth.clone());
    }
    let http = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("youtube SetSID client: {error}"))?;
    let minted = mint_login_info(&http, auth)?;
    if session_is_youtube_bound(&minted) {
        return Ok(minted);
    }
    let mut url = YOUTUBE_CONTINUE_URL.to_string();
    let mut current = minted;
    for _ in 0..8 {
        let response = http
            .get(&url)
            .header("cookie", handshake_cookie_header(&current))
            .header("user-agent", HANDSHAKE_USER_AGENT)
            .header("accept", "text/html")
            .send()
            .map_err(|error| format!("youtube SetSID failed: {error}"))?;
        let set_cookies = response_set_cookies(&response);
        current = apply_set_cookies(&current, &set_cookies);
        let status = response.status();
        if status.is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    format!("youtube SetSID HTTP {} missing Location", status.as_u16())
                })?;
            url = resolve_location(&url, location)?;
            if reqwest::Url::parse(&url)
                .ok()
                .is_some_and(|parsed| parsed.host_str() == Some("music.youtube.com"))
            {
                return mint_login_info(&http, &current);
            }
            continue;
        }
        if !status.is_success() {
            return Err(format!("youtube SetSID returned HTTP {}", status.as_u16()));
        }
        break;
    }
    mint_login_info(&http, &current)
}

fn resolve_location(current: &str, location: &str) -> Result<String, String> {
    let base = reqwest::Url::parse(current)
        .map_err(|error| format!("youtube SetSID url {current}: {error}"))?;
    base.join(location)
        .map(|url| url.to_string())
        .map_err(|error| format!("youtube SetSID location {location}: {error}"))
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
        identity_cookies: identity_cookie_header(pairs),
        email: String::new(),
        display_name: String::new(),
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
