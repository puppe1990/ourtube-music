use fake::faker::lorem::en::Word;
use fake::faker::name::en::Name;
use fake::Fake;
use ourtube_music::lastfm::{
    allowed_lastfm_auth_url, api_signature, lastfm_auth_url, lastfm_path, load_store,
    missing_keys_error, resolve_key, save_store, should_scrobble, LastFmSession, LastFmStore,
};
use std::collections::BTreeMap;

fn hex_word() -> String {
    let word: String = Word().fake();
    format!("{word:x>8}")
}

#[test]
fn api_signature_matches_the_lastfm_authspec_example() {
    let mut params = BTreeMap::new();
    params.insert("token".to_string(), "yyy".to_string());
    params.insert("api_key".to_string(), "xxx".to_string());
    params.insert("method".to_string(), "auth.getSession".to_string());
    params.insert("format".to_string(), "json".to_string());

    assert_eq!(
        api_signature(&params, "zzz"),
        "75df1fdb6b738160924a52b1732fdde7"
    );
}

#[test]
fn lastfm_auth_url_points_at_the_desktop_approval_page() {
    let api_key = hex_word();
    let token = hex_word();

    assert_eq!(
        lastfm_auth_url(&api_key, &token),
        format!("https://www.last.fm/api/auth/?api_key={api_key}&token={token}")
    );
}

#[test]
fn allowed_lastfm_auth_url_rejects_anything_outside_lastfm_auth() {
    let api_key = hex_word();
    let token = hex_word();
    let allowed = lastfm_auth_url(&api_key, &token);

    assert!(allowed_lastfm_auth_url(&allowed));
    assert!(allowed_lastfm_auth_url(
        "https://last.fm/api/auth/?api_key=x&token=y"
    ));
    assert!(!allowed_lastfm_auth_url(
        "http://www.last.fm/api/auth/?api_key=x"
    ));
    assert!(!allowed_lastfm_auth_url("https://www.last.fm/user/x"));
    assert!(!allowed_lastfm_auth_url(
        "https://evil.example/api/auth/?api_key=x"
    ));
}

#[test]
fn should_scrobble_follows_the_half_duration_or_four_minute_rule() {
    assert!(!should_scrobble(30.0, 30.0));
    assert!(!should_scrobble(60.0, 29.0));
    assert!(should_scrobble(60.0, 30.0));
    assert!(!should_scrobble(600.0, 239.0));
    assert!(should_scrobble(600.0, 240.0));
}

#[test]
fn missing_keys_error_points_at_the_api_account_form() {
    let message = missing_keys_error();
    assert!(message.contains("https://www.last.fm/api/account/create"));
    assert!(message.contains("LASTFM_API_KEY"));
    assert!(message.contains("lastfm.json"));
}

#[test]
fn resolve_key_prefers_a_non_empty_env_value() {
    let file_value: String = Word().fake();
    let env_value: String = Word().fake();

    assert_eq!(resolve_key(&file_value, Some(&env_value)), env_value);
    assert_eq!(resolve_key(&file_value, Some("")), file_value);
    assert_eq!(resolve_key(&file_value, None), file_value);
}

#[test]
fn lastfm_store_round_trips_next_to_the_app_config_dir() {
    let dir = std::env::temp_dir().join(format!("ourtube-lastfm-{}", hex_word()));
    std::fs::create_dir_all(&dir).expect("temp lastfm dir");
    let username: String = Name().fake();
    let store = LastFmStore {
        session_key: hex_word(),
        username: username.clone(),
        pending_token: String::new(),
        api_key: String::new(),
        api_secret: String::new(),
    };

    save_store(&dir, &store).expect("save lastfm");
    let loaded = load_store(&dir).expect("load lastfm");

    assert_eq!(loaded.username, username);
    assert_eq!(loaded.session_key, store.session_key);
    assert!(lastfm_path(&dir).ends_with("lastfm.json"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn session_picks_up_a_key_written_after_load() {
    let dir = std::env::temp_dir().join(format!("ourtube-lastfm-{}", hex_word()));
    std::fs::create_dir_all(&dir).expect("temp lastfm dir");
    save_store(&dir, &LastFmStore::default()).expect("save empty");
    let session = LastFmSession::load(dir.clone());
    assert!(!session.view().connected);

    let username: String = Name().fake();
    save_store(
        &dir,
        &LastFmStore {
            session_key: hex_word(),
            username: username.clone(),
            ..LastFmStore::default()
        },
    )
    .expect("save session");

    assert!(
        session.view().connected,
        "a session written after startup must replace the empty in-memory copy"
    );
    assert_eq!(session.view().username, username);
    let _ = std::fs::remove_dir_all(&dir);
}
