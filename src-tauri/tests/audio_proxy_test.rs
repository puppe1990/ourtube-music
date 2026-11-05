use ourtube_music::audio_proxy::{audio_path, container_from_query, parse_request_line, range_header};

#[test]
fn audio_path_defaults_to_mp4_and_can_ask_for_webm() {
    assert_eq!(audio_path("dQw4w9WgXcQ", None), "/audio/dQw4w9WgXcQ");
    assert_eq!(
        audio_path("dQw4w9WgXcQ", Some("webm")),
        "/audio/dQw4w9WgXcQ?container=webm"
    );
}

#[test]
fn container_query_ignores_unknown_values() {
    assert_eq!(container_from_query(Some("webm")), Some("webm"));
    assert_eq!(container_from_query(Some("ogg")), None);
    assert_eq!(container_from_query(None), None);
}

#[test]
fn request_line_yields_video_id_and_container() {
    let line = "GET /audio/abc123?container=webm HTTP/1.1";

    let request = parse_request_line(line).expect("parse request line");

    assert_eq!(request.video_id, "abc123");
    assert_eq!(request.container, Some("webm".to_string()));
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
