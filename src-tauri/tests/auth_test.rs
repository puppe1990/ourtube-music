use fake::faker::lorem::en::Word;
use fake::Fake;
use ourtube_music::auth::{
    auth_header, device_token_form, needs_refresh, parse_device_start, parse_poll, refresh_form,
    PollOutcome, TokenSet, CLIENT_SECRET,
};
use serde_json::json;

#[test]
fn device_start_reads_the_google_payload() {
    let code: String = Word().fake();
    let user_code: String = Word().fake();
    let payload = json!({
        "device_code": code,
        "user_code": user_code,
        "expires_in": 1800,
        "interval": 5,
        "verification_url": "https://www.google.com/device"
    });

    let start = parse_device_start(&payload).expect("parse device start");

    assert_eq!(start.device_code, code);
    assert_eq!(start.user_code, user_code);
    assert_eq!(start.expires_in, 1800);
    assert_eq!(start.interval, 5);
    assert_eq!(start.verification_url, "https://www.google.com/device");
}

#[test]
fn pending_and_slow_down_are_states_not_errors() {
    let pending = json!({ "error": "authorization_pending" });
    let slow = json!({ "error": "slow_down" });

    assert_eq!(parse_poll(&pending, 0, None), Ok(PollOutcome::Pending));
    assert_eq!(parse_poll(&slow, 0, None), Ok(PollOutcome::SlowDown));
}

#[test]
fn expired_and_denied_carry_the_google_error() {
    for code in ["expired_token", "access_denied"] {
        let payload = json!({ "error": code });
        let error = parse_poll(&payload, 0, None).expect_err("want error");
        assert!(error.contains(code), "error must carry {code}: {error}");
    }
}

#[test]
fn success_creates_a_token_set_with_expiry() {
    let access: String = Word().fake();
    let refresh: String = Word().fake();
    let payload = json!({ "access_token": access, "refresh_token": refresh, "expires_in": 3600 });

    let PollOutcome::Token(tokens) = parse_poll(&payload, 1_000, None).expect("token") else {
        panic!("want a token outcome");
    };

    assert_eq!(tokens.access_token, access);
    assert_eq!(tokens.refresh_token, refresh);
    assert_eq!(tokens.expires_at, 4_600);
}

#[test]
fn refresh_response_without_refresh_token_keeps_the_previous_one() {
    let previous: String = Word().fake();
    let payload = json!({ "access_token": "novo", "expires_in": 3600 });

    let PollOutcome::Token(tokens) = parse_poll(&payload, 0, Some(&previous)).expect("token") else {
        panic!("want a token outcome");
    };

    assert_eq!(tokens.refresh_token, previous);
}

#[test]
fn token_exchange_carries_the_client_secret() {
    // Google answers `invalid_request: Missing required parameter: client_secret`
    // for the TV client without it (probed 2026-11-05).
    let form = device_token_form("device-123");
    let field = |name: &str| form.iter().find(|(key, _)| *key == name).map(|(_, value)| value.as_str());

    assert_eq!(field("client_secret"), Some(CLIENT_SECRET));
    assert_eq!(field("device_code"), Some("device-123"));
    assert_eq!(
        field("grant_type"),
        Some("urn:ietf:params:oauth:grant-type:device_code")
    );
}

#[test]
fn refresh_exchange_carries_the_client_secret() {
    let form = refresh_form("refresh-123");
    let field = |name: &str| form.iter().find(|(key, _)| *key == name).map(|(_, value)| value.as_str());

    assert_eq!(field("client_secret"), Some(CLIENT_SECRET));
    assert_eq!(field("refresh_token"), Some("refresh-123"));
    assert_eq!(field("grant_type"), Some("refresh_token"));
}

#[test]
fn tokens_are_refreshed_one_minute_before_expiry() {
    assert!(needs_refresh(1_000, 940));
    assert!(!needs_refresh(1_000, 930));
    assert!(needs_refresh(0, 0), "a token without expiry must be refreshed");
}

#[test]
fn auth_header_is_a_bearer_token() {
    assert_eq!(auth_header("abc"), "Bearer abc");
}

#[test]
fn token_set_round_trips_through_disk_with_0600() {
    let dir = std::env::temp_dir().join(format!("ourtube-auth-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let tokens = TokenSet {
        access_token: "a".to_string(),
        refresh_token: "r".to_string(),
        expires_at: 99,
    };

    ourtube_music::auth::save_tokens(&dir, &tokens).expect("save");
    let loaded = ourtube_music::auth::load_tokens(&dir).expect("load");

    assert_eq!(loaded, tokens);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(ourtube_music::auth::token_path(&dir))
            .expect("metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600, "token file must be 0600");
    }
    let _ = std::fs::remove_dir_all(&dir);
}
