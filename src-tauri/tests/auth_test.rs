use ourtube_music::auth::{
    cookie_header, extract_cookie_auth, sapisid_hash, CookieAuth,
};

#[test]
fn sapisid_hash_matches_the_web_scheme() {
    // sha1("1700000000 abc123 https://music.youtube.com")
    assert_eq!(
        sapisid_hash("abc123", 1_700_000_000),
        "SAPISIDHASH 1700000000_597a8411c1c01f9c14cea84b6ec377b76d93be6e"
    );
}

#[test]
fn cookie_header_joins_pairs_in_order() {
    let pairs = vec![
        ("SAPISID".to_string(), "abc".to_string()),
        ("SID".to_string(), "def".to_string()),
    ];

    assert_eq!(cookie_header(&pairs), "SAPISID=abc; SID=def");
}

#[test]
fn extract_cookie_auth_prefers_sapisid() {
    let pairs = vec![
        ("__Secure-3PAPISID".to_string(), "secure".to_string()),
        ("SAPISID".to_string(), "plain".to_string()),
    ];

    let auth = extract_cookie_auth(&pairs).expect("signed in");

    assert_eq!(auth.sapisid, "plain");
    assert!(auth.cookies.contains("SAPISID=plain"));
}

#[test]
fn extract_cookie_auth_falls_back_to_the_secure_cookie() {
    let pairs = vec![("__Secure-3PAPISID".to_string(), "secure".to_string())];

    let auth = extract_cookie_auth(&pairs).expect("signed in");

    assert_eq!(auth.sapisid, "secure");
}

#[test]
fn extract_cookie_auth_needs_a_signing_cookie() {
    let pairs = vec![("SID".to_string(), "only".to_string())];

    assert!(extract_cookie_auth(&pairs).is_none());
}

#[test]
fn credentials_round_trip_through_disk_with_0600() {
    let dir = std::env::temp_dir().join(format!("ourtube-creds-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let auth = CookieAuth {
        cookies: "SAPISID=abc".to_string(),
        sapisid: "abc".to_string(),
    };

    ourtube_music::auth::save_credentials(&dir, &auth).expect("save");
    let loaded = ourtube_music::auth::load_credentials(&dir).expect("load");

    assert_eq!(loaded, auth);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(ourtube_music::auth::credential_path(&dir))
            .expect("metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }
    let _ = std::fs::remove_dir_all(&dir);
}
