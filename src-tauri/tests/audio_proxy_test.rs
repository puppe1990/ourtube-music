use ourtube_music::audio_proxy::{
    audio_path, parse_request_line, range_header, variant_from_query,
};

#[test]
fn audio_path_defaults_to_adaptive_and_can_ask_for_other_variants() {
    assert_eq!(audio_path("dQw4w9WgXcQ", None), "/audio/dQw4w9WgXcQ");
    assert_eq!(
        audio_path("dQw4w9WgXcQ", Some("webm")),
        "/audio/dQw4w9WgXcQ?variant=webm"
    );
    assert_eq!(
        audio_path("dQw4w9WgXcQ", Some("muxed")),
        "/audio/dQw4w9WgXcQ?variant=muxed"
    );
}

#[test]
fn variant_query_ignores_unknown_values() {
    assert_eq!(variant_from_query(Some("webm")), Some("webm"));
    assert_eq!(variant_from_query(Some("muxed")), Some("muxed"));
    assert_eq!(variant_from_query(Some("ogg")), None);
    assert_eq!(variant_from_query(None), None);
}

#[test]
fn request_line_yields_video_id_and_container() {
    let line = "GET /audio/abc123?variant=muxed HTTP/1.1";

    let request = parse_request_line(line).expect("parse request line");

    assert_eq!(request.video_id, "abc123");
    assert_eq!(request.variant, Some("muxed".to_string()));
}

#[test]
fn request_line_rejects_unknown_paths() {
    let line = "GET /innertube/music_home HTTP/1.1";

    assert!(parse_request_line(line).is_none());
}

#[test]
fn range_header_is_forwarded_verbatim() {
    let raw = "GET /audio/abc HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=0-\r\n\r\n";
    let mut lines = raw.split("\r\n");

    assert_eq!(range_header(&mut lines), Some("bytes=0-".to_string()));
}
