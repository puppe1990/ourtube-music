use ourtube_music::commands::validate_external_url;

#[test]
fn google_device_page_is_allowed() {
    assert!(validate_external_url("https://www.google.com/device").is_ok());
    assert!(validate_external_url("https://google.com/device?hl=pt-BR").is_ok());
}

#[test]
fn other_hosts_are_refused_with_the_host_name() {
    let error = validate_external_url("https://example.com/device").expect_err("want refusal");

    assert!(error.contains("example.com"), "error must name the host: {error}");
}

#[test]
fn non_https_schemes_are_refused() {
    for url in ["http://www.google.com/device", "javascript:alert(1)", "file:///etc/passwd"] {
        assert!(validate_external_url(url).is_err(), "{url} must be refused");
    }
}
