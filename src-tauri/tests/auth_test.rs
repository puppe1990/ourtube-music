use fake::faker::lorem::en::Word;
use fake::Fake;
use ourtube_music::auth::{
    apply_login_info_cookies, apply_set_cookies, cookie_header, extract_cookie_auth,
    handshake_cookie_header, identity_cookie_header, parse_cookie_header, sapisid_hash,
    youtube_session_ready, CookieAuth,
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
fn cookie_header_keeps_only_the_auth_cookies() {
    let pairs = vec![
        ("SAPISID".to_string(), "abc".to_string()),
        ("__Host-GAPS".to_string(), "junk".to_string()),
        ("SID".to_string(), "def".to_string()),
    ];

    // __Host-* cookies make Innertube answer as anonymous (probed 2026-11-05).
    assert_eq!(cookie_header(&pairs), "SAPISID=abc; SID=def");
}

#[test]
fn identity_cookie_header_keeps_the_google_account_cookies() {
    let pairs = vec![
        ("SAPISID".to_string(), "abc".to_string()),
        ("__Host-GAPS".to_string(), "gaps".to_string()),
        ("ACCOUNT_CHOOSER".to_string(), "chooser".to_string()),
        ("LSID".to_string(), "lsid".to_string()),
        ("__Host-1PLSID".to_string(), "one".to_string()),
        ("__Host-3PLSID".to_string(), "three".to_string()),
    ];

    assert_eq!(
        identity_cookie_header(&pairs),
        "ACCOUNT_CHOOSER=chooser; LSID=lsid; __Host-GAPS=gaps; __Host-1PLSID=one; __Host-3PLSID=three"
    );
    assert!(
        !identity_cookie_header(&pairs).contains("SAPISID"),
        "Innertube signing cookies stay out of ListAccounts"
    );
}

#[test]
fn cookie_header_keeps_the_first_value_of_each_name() {
    // The jar carries .google.com and .youtube.com entries; duplicates make the
    // server ignore the session.
    let pairs = vec![
        ("SAPISID".to_string(), "google".to_string()),
        ("SAPISID".to_string(), "youtube".to_string()),
    ];

    assert_eq!(cookie_header(&pairs), "SAPISID=google");
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
fn cookie_header_keeps_login_info_from_the_youtube_jar() {
    let login_info: String = Word().fake();
    let pairs = vec![
        ("SAPISID".to_string(), "abc".to_string()),
        ("LOGIN_INFO".to_string(), login_info.clone()),
    ];

    let header = cookie_header(&pairs);

    assert!(
        header.contains(&format!("LOGIN_INFO={login_info}")),
        "YouTube SetSID leaves LOGIN_INFO on .youtube.com (probed 2026-11-06)"
    );
}

#[test]
fn youtube_session_ready_is_false_with_only_google_sid() {
    let pairs = vec![
        ("SAPISID".to_string(), "abc".to_string()),
        ("SID".to_string(), "def".to_string()),
    ];

    assert!(
        !youtube_session_ready(&pairs),
        "Google SAPISID is not a YouTube Music session until SetSID"
    );
}

#[test]
fn youtube_session_ready_is_true_with_login_info() {
    let login_info: String = Word().fake();
    let pairs = vec![
        ("SAPISID".to_string(), "abc".to_string()),
        ("LOGIN_INFO".to_string(), login_info),
    ];

    assert!(youtube_session_ready(&pairs));
}

#[test]
fn youtube_session_ready_is_true_with_visitor_cookie() {
    let visitor: String = Word().fake();
    let pairs = vec![
        ("SAPISID".to_string(), "abc".to_string()),
        ("VISITOR_INFO1_LIVE".to_string(), visitor),
    ];

    assert!(youtube_session_ready(&pairs));
}

#[test]
fn apply_set_cookies_replaces_stale_sapisid_and_adds_login_info() {
    let stale: String = Word().fake();
    let fresh: String = Word().fake();
    let login_info: String = Word().fake();
    let auth = CookieAuth {
        cookies: format!("SAPISID={stale}; SID=def"),
        sapisid: stale.clone(),
        identity_cookies: "ACCOUNT_CHOOSER=chooser".to_string(),
        ..Default::default()
    };

    let next = apply_set_cookies(
        &auth,
        &[
            format!("SAPISID={fresh}; Domain=.youtube.com; Secure"),
            format!("LOGIN_INFO={login_info}; Domain=.youtube.com; Secure; HttpOnly"),
        ],
    );

    assert_eq!(next.sapisid, fresh);
    assert!(next.cookies.contains(&format!("SAPISID={fresh}")));
    assert!(!next.cookies.contains(&format!("SAPISID={stale}")));
    assert!(next.cookies.contains(&format!("LOGIN_INFO={login_info}")));
    assert_eq!(next.identity_cookies, "ACCOUNT_CHOOSER=chooser");
}

#[test]
fn apply_set_cookies_drops_max_age_zero_and_empty_values() {
    let sapisid: String = Word().fake();
    let auth = CookieAuth {
        cookies: format!("SAPISID={sapisid}; SID=keep; LOGIN_INFO=stale"),
        sapisid: sapisid.clone(),
        ..Default::default()
    };

    let next = apply_set_cookies(
        &auth,
        &[
            "SID=; Max-Age=0; Domain=.youtube.com".to_string(),
            "LOGIN_INFO=; Expires=Sat, 10-Feb-2024 00:00:00 GMT".to_string(),
        ],
    );

    let names: Vec<String> = parse_cookie_header(&next.cookies)
        .into_iter()
        .map(|(name, _)| name)
        .collect();
    assert!(!names.iter().any(|name| name == "SID"));
    assert!(!names.iter().any(|name| name == "LOGIN_INFO"));
    assert!(next.cookies.contains(&format!("SAPISID={sapisid}")));
}

#[test]
fn apply_set_cookies_keeps_identity_host_cookies_out_of_innertube() {
    let gaps: String = Word().fake();
    let auth = CookieAuth {
        cookies: "SAPISID=abc".to_string(),
        sapisid: "abc".to_string(),
        identity_cookies: "__Host-GAPS=old".to_string(),
        ..Default::default()
    };

    let next = apply_set_cookies(&auth, &[format!("__Host-GAPS={gaps}; Path=/; Secure")]);

    assert!(next
        .identity_cookies
        .contains(&format!("__Host-GAPS={gaps}")));
    assert!(
        !next.cookies.contains("__Host-GAPS"),
        "__Host-* on Innertube made browse anonymous (probed 2026-11-05)"
    );
}

#[test]
fn apply_login_info_cookies_keeps_google_sid_when_html_expires_it() {
    let sapisid: String = Word().fake();
    let auth = CookieAuth {
        cookies: format!("SAPISID={sapisid}; SID=google-sid"),
        sapisid: sapisid.clone(),
        ..Default::default()
    };

    let next = apply_login_info_cookies(
        &auth,
        &[
            "SID=; Expires=Sat, 10-Feb-2024 00:00:00 GMT; Domain=.youtube.com".to_string(),
            "SAPISID=; Max-Age=0; Domain=.youtube.com".to_string(),
            "VISITOR_INFO1_LIVE=anon; Domain=.youtube.com".to_string(),
        ],
    );

    assert_eq!(next.sapisid, sapisid);
    assert!(next.cookies.contains(&format!("SAPISID={sapisid}")));
    assert!(next.cookies.contains("SID=google-sid"));
    assert!(!next.cookies.contains("VISITOR_INFO1_LIVE"));
}

#[test]
fn apply_login_info_cookies_keeps_login_info_from_signed_in_html() {
    let sapisid: String = Word().fake();
    let login_info: String = Word().fake();
    let auth = CookieAuth {
        cookies: format!("SAPISID={sapisid}; SID=youtube-sid"),
        sapisid: sapisid.clone(),
        ..Default::default()
    };

    let next = apply_login_info_cookies(
        &auth,
        &[
            format!("LOGIN_INFO={login_info}; Domain=.youtube.com; Secure; HttpOnly"),
            "VISITOR_INFO1_LIVE=visitor; Domain=.youtube.com".to_string(),
        ],
    );

    assert!(next.cookies.contains(&format!("LOGIN_INFO={login_info}")));
    assert!(next.cookies.contains("VISITOR_INFO1_LIVE=visitor"));
    assert_eq!(next.sapisid, sapisid);
}

#[test]
fn handshake_cookie_header_sends_identity_with_the_google_sid() {
    let auth = CookieAuth {
        cookies: "SAPISID=abc; SID=def".to_string(),
        sapisid: "abc".to_string(),
        identity_cookies: "ACCOUNT_CHOOSER=chooser; LSID=lsid".to_string(),
        ..Default::default()
    };

    let header = handshake_cookie_header(&auth);

    assert!(header.contains("ACCOUNT_CHOOSER=chooser"));
    assert!(header.contains("LSID=lsid"));
    assert!(header.contains("SAPISID=abc"));
    assert!(header.contains("SID=def"));
}

#[test]
fn credentials_round_trip_through_disk_with_0600() {
    let dir = std::env::temp_dir().join(format!("ourtube-creds-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let auth = CookieAuth {
        cookies: "SAPISID=abc".to_string(),
        sapisid: "abc".to_string(),
        ..Default::default()
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
