use ourtube_music::innertube::client::playback_source;
use ourtube_music::innertube::models::Stream;

fn stream_with_muxed() -> Stream {
    Stream {
        audio_url: "https://cdn/dash-aac".to_string(),
        mime_type: "audio/mp4; codecs=\"mp4a.40.2\"".to_string(),
        itag: 140,
        bitrate: 131000,
        fallback_url: "https://cdn/muxed".to_string(),
        fallback_mime: "video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"".to_string(),
        fallback_itag: 18,
        ..Stream::default()
    }
}

#[test]
fn playback_prefers_progressive_muxed_mp4_for_the_audio_element() {
    // Adaptive itag 140 is DASH fMP4 (`ftypdash`); WKWebView's <audio> rejects
    // it. ANDROID itag 18 is progressive (`ftypmp42`) and plays (probed 2026-11-05).
    let (url, mime, itag) = playback_source(&stream_with_muxed(), None).expect("source");

    assert_eq!(url, "https://cdn/muxed");
    assert!(mime.starts_with("video/mp4"), "mime was {mime}");
    assert_eq!(itag, 18);
}

#[test]
fn playback_keeps_adaptive_audio_when_the_caller_asks_for_webm() {
    let stream = Stream {
        audio_url: "https://cdn/opus".to_string(),
        mime_type: "audio/webm; codecs=\"opus\"".to_string(),
        itag: 251,
        fallback_url: "https://cdn/muxed".to_string(),
        fallback_mime: "video/mp4".to_string(),
        fallback_itag: 18,
        ..Stream::default()
    };

    let (url, mime, itag) = playback_source(&stream, Some("webm")).expect("source");

    assert_eq!(url, "https://cdn/opus");
    assert!(mime.starts_with("audio/webm"), "mime was {mime}");
    assert_eq!(itag, 251);
}

#[test]
fn playback_falls_back_to_adaptive_audio_when_muxed_is_missing() {
    let stream = Stream {
        audio_url: "https://cdn/dash-aac".to_string(),
        mime_type: "audio/mp4".to_string(),
        itag: 140,
        ..Stream::default()
    };

    let (url, _mime, itag) = playback_source(&stream, None).expect("source");

    assert_eq!(url, "https://cdn/dash-aac");
    assert_eq!(itag, 140);
}
