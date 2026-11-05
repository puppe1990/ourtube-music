use ourtube_music::innertube::client::{client_kind_for, request_body};
use ourtube_music::innertube::endpoints::{
    ACCOUNT_MENU, BROWSE, ClientKind, GUIDE, NEXT, PLAYER, SEARCH, SUGGESTIONS, WEB_CLIENT_VERSION,
};
use serde_json::json;

#[test]
fn endpoints_match_the_captured_paths() {
    // Mapped from the decrypted Brave capture (2026-11-05) on music.youtube.com.
    assert_eq!(SEARCH, "/youtubei/v1/search");
    assert_eq!(BROWSE, "/youtubei/v1/browse");
    assert_eq!(NEXT, "/youtubei/v1/next");
    assert_eq!(PLAYER, "/youtubei/v1/player");
    assert_eq!(GUIDE, "/youtubei/v1/guide");
    assert_eq!(ACCOUNT_MENU, "/youtubei/v1/account/account_menu");
    assert_eq!(SUGGESTIONS, "/youtubei/v1/music/get_search_suggestions");
}

#[test]
fn browsing_endpoints_use_the_web_remix_client() {
    for endpoint in [SEARCH, BROWSE, NEXT, GUIDE, ACCOUNT_MENU, SUGGESTIONS] {
        assert_eq!(
            client_kind_for(endpoint),
            ClientKind::WebRemix,
            "{endpoint} must use WEB_REMIX"
        );
    }
}

#[test]
fn player_uses_the_ios_client_because_web_remix_is_unplayable() {
    assert_eq!(client_kind_for(PLAYER), ClientKind::Ios);
}

#[test]
fn web_remix_body_carries_the_captured_context() {
    let body = request_body(SEARCH, json!({ "query": "daft punk" }));

    assert_eq!(body["context"]["client"]["clientName"], "WEB_REMIX");
    assert_eq!(body["context"]["client"]["clientVersion"], WEB_CLIENT_VERSION);
    assert_eq!(body["context"]["client"]["hl"], "en");
    assert_eq!(body["query"], "daft punk");
}

#[test]
fn ios_body_carries_the_device_model() {
    let body = request_body(PLAYER, json!({ "videoId": "dQw4w9WgXcQ" }));

    assert_eq!(body["context"]["client"]["clientName"], "IOS");
    assert_eq!(body["context"]["client"]["deviceModel"], "iPhone16,2");
    assert_eq!(body["videoId"], "dQw4w9WgXcQ");
    assert_eq!(body["contentCheckOk"], true);
}

#[test]
fn request_body_keeps_params_that_collide_with_no_context_key() {
    let body = request_body(BROWSE, json!({ "browseId": "FEmusic_home" }));

    assert_eq!(body["browseId"], "FEmusic_home");
    assert!(body["context"].is_object());
}
