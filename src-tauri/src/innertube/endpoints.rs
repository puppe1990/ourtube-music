//! Innertube endpoints captured from a decrypted Brave session on 2026-11-05.
//! Paths are relative to `https://music.youtube.com`; every call wants
//! `?prettyPrint=false` (the web client always sends it).

pub const BASE_URL: &str = "https://music.youtube.com";

pub const SEARCH: &str = "/youtubei/v1/search";
pub const BROWSE: &str = "/youtubei/v1/browse";
pub const NEXT: &str = "/youtubei/v1/next";
pub const PLAYER: &str = "/youtubei/v1/player";
pub const GUIDE: &str = "/youtubei/v1/guide";
pub const ACCOUNT_MENU: &str = "/youtubei/v1/account/account_menu";
pub const SUGGESTIONS: &str = "/youtubei/v1/music/get_search_suggestions";

pub const WEB_CLIENT_NAME: &str = "WEB_REMIX";
pub const WEB_CLIENT_VERSION: &str = "1.20261104.00.00";

/// WEB_REMIX answers `UNPLAYABLE` for /player; IOS returns direct googlevideo
/// URLs (probed 2026-11-05), so streaming pins this client.
pub const IOS_CLIENT_NAME: &str = "IOS";
pub const IOS_CLIENT_VERSION: &str = "20.10.4";
pub const IOS_DEVICE_MODEL: &str = "iPhone16,2";
pub const IOS_OS_VERSION: &str = "18.3.2.22D82";

pub const LOCALE: &str = "en";
pub const REGION: &str = "US";

pub const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientKind {
    WebRemix,
    Ios,
}
