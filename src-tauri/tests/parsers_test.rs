use fake::faker::lorem::en::Sentence;
use fake::faker::name::en::Name;
use fake::Fake;
use ourtube_music::innertube::parsers::{
    parse_account, parse_guide, parse_home_shelves, parse_queue, parse_search_results,
    parse_stream, parse_suggestions,
};
use serde_json::{json, Value};

fn runs(texts: &[&str]) -> Value {
    json!({ "runs": texts.iter().map(|text| json!({ "text": text })).collect::<Vec<_>>() })
}

fn thumbnails(urls: &[&str]) -> Value {
    json!({
        "thumbnails": urls.iter().map(|url| json!({ "url": url, "width": 60, "height": 60 })).collect::<Vec<_>>()
    })
}

fn responsive_track(video_id: &str, title: &str, byline: &str, duration: &str) -> Value {
    json!({
        "musicResponsiveListItemRenderer": {
            "thumbnail": { "musicThumbnailRenderer": { "thumbnail": thumbnails(&["https://img/small", "https://img/large"]) } },
            "flexColumns": [
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[title]) } },
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[byline]) } },
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[duration]) } }
            ],
            "playlistItemData": { "videoId": video_id }
        }
    })
}

fn search_payload(rows: Vec<Value>) -> Value {
    json!({
        "contents": { "tabbedSearchResultsRenderer": { "tabs": [ { "tabRenderer": { "content": {
            "sectionListRenderer": { "contents": [ { "musicShelfRenderer": { "contents": rows } } ] }
        } } } ] } }
    })
}

#[test]
fn search_results_read_title_artist_and_duration() {
    let first_title: String = Sentence(2..5).fake();
    let second_title: String = Sentence(2..5).fake();
    let artist: String = Name().fake();
    let album: String = Sentence(1..3).fake();
    let byline = format!("{artist} • {album}");

    let payload = search_payload(vec![
        responsive_track("vid-a", &first_title, &byline, "3:45"),
        responsive_track("vid-b", &second_title, &byline, "4:01"),
    ]);

    let tracks = parse_search_results(&payload).expect("parse search results");

    assert_eq!(tracks.len(), 2, "want both rows: {tracks:?}");
    assert_eq!(tracks[0].video_id, "vid-a");
    assert_eq!(tracks[0].title, first_title);
    assert_eq!(tracks[0].artist, artist);
    assert_eq!(tracks[0].album, album);
    assert_eq!(tracks[0].duration, "3:45");
    assert_eq!(tracks[0].thumbnail, "https://img/large");
}

#[test]
fn search_results_skip_rows_without_video_id() {
    let title: String = Sentence(2..5).fake();
    let mut row = responsive_track("vid-a", &title, "Artist", "3:45");
    row["musicResponsiveListItemRenderer"]
        .as_object_mut()
        .expect("renderer object")
        .remove("playlistItemData");
    // The play overlay is absent too, so the row has no watch target.

    let tracks = parse_search_results(&search_payload(vec![row])).expect("parse search results");

    assert!(tracks.is_empty(), "want no tracks, got {tracks:?}");
}

#[test]
fn search_results_use_play_overlay_as_video_id_fallback() {
    let title: String = Sentence(2..5).fake();
    let row = json!({
        "musicResponsiveListItemRenderer": {
            "flexColumns": [
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[&title]) } }
            ],
            "overlay": { "musicItemThumbnailOverlayRenderer": { "content": {
                "musicPlayButtonRenderer": { "playNavigationEndpoint": { "watchEndpoint": { "videoId": "overlay-id" } } }
            } } }
        }
    });

    let tracks = parse_search_results(&search_payload(vec![row])).expect("parse search results");

    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].video_id, "overlay-id");
}

#[test]
fn home_shelves_keep_carousel_title_and_rows() {
    let shelf_title: String = Sentence(1..3).fake();
    let first: String = Sentence(1..3).fake();
    let second: String = Sentence(1..3).fake();
    let artist: String = Name().fake();

    let payload = json!({ "contents": { "singleColumnBrowseResultsRenderer": { "tabs": [ { "tabRenderer": {
        "content": { "sectionListRenderer": { "contents": [ { "musicCarouselShelfRenderer": {
            "header": { "musicCarouselShelfBasicHeaderRenderer": { "title": runs(&[&shelf_title]) } },
            "contents": [
                { "musicTwoRowItemRenderer": {
                    "title": runs(&[&first]),
                    "subtitle": runs(&[&artist]),
                    "thumbnailRenderer": { "musicThumbnailRenderer": { "thumbnail": thumbnails(&["https://img/one"]) } },
                    "navigationEndpoint": { "watchEndpoint": { "videoId": "home-1" } }
                } },
                { "musicTwoRowItemRenderer": {
                    "title": runs(&[&second]),
                    "subtitle": runs(&[&artist]),
                    "thumbnailRenderer": { "musicThumbnailRenderer": { "thumbnail": thumbnails(&["https://img/two"]) } },
                    "navigationEndpoint": { "watchEndpoint": { "videoId": "home-2" } }
                } }
            ]
        } } ] } }
    } } ] } } });

    let shelves = parse_home_shelves(&payload).expect("parse home");

    assert_eq!(shelves.len(), 1, "want one shelf: {shelves:?}");
    assert_eq!(shelves[0].title, shelf_title);
    assert_eq!(shelves[0].tracks.len(), 2);
    assert_eq!(shelves[0].tracks[1].video_id, "home-2");
    assert_eq!(shelves[0].tracks[0].artist, artist);
}

#[test]
fn home_shelves_drop_empty_carousels() {
    let payload = json!({ "contents": { "sectionListRenderer": { "contents": [
        { "musicCarouselShelfRenderer": { "header": { "musicCarouselShelfBasicHeaderRenderer": { "title": runs(&["Empty"]) } }, "contents": [] } }
    ] } } });

    let shelves = parse_home_shelves(&payload).expect("parse home");

    assert!(shelves.is_empty(), "want no shelves, got {shelves:?}");
}

#[test]
fn queue_reads_playlist_panel_rows_in_order() {
    let payload = json!({ "contents": { "singleColumnMusicWatchNextResultsRenderer": { "tabbedRenderer": {
        "watchNextTabbedResultsRenderer": { "tabs": [ { "tabRenderer": { "content": { "musicQueueRenderer": {
            "content": { "playlistPanelRenderer": { "contents": [
                { "playlistPanelVideoRenderer": {
                    "videoId": "q-1",
                    "title": runs(&["First"]),
                    "longBylineText": runs(&["Artist One"]),
                    "lengthText": runs(&["4:02"]),
                    "thumbnail": thumbnails(&["https://img/q1"])
                } },
                { "playlistPanelVideoRenderer": {
                    "videoId": "q-2",
                    "title": runs(&["Second"]),
                    "longBylineText": runs(&["Artist Two"]),
                    "lengthText": runs(&["2:10"]),
                    "thumbnail": thumbnails(&["https://img/q2"])
                } }
            ] } }
        } } } } ] }
    } } } });

    let tracks = parse_queue(&payload).expect("parse queue");

    assert_eq!(tracks.len(), 2);
    assert_eq!(tracks[0].video_id, "q-1");
    assert_eq!(tracks[1].title, "Second");
    assert_eq!(tracks[0].duration, "4:02");
}

#[test]
fn stream_prefers_mp4_audio_then_the_highest_bitrate() {
    let payload = json!({
        "playabilityStatus": { "status": "OK" },
        "videoDetails": { "videoId": "vid-x", "title": "Song", "author": "Artist", "lengthSeconds": "213" },
        "streamingData": { "adaptiveFormats": [
            { "itag": 137, "mimeType": "video/mp4; codecs=\"avc1.640028\"", "bitrate": 4334157, "url": "https://cdn/video" },
            { "itag": 139, "mimeType": "audio/mp4; codecs=\"mp4a.40.5\"", "bitrate": 50152, "url": "https://cdn/audio-low" },
            { "itag": 140, "mimeType": "audio/mp4; codecs=\"mp4a.40.2\"", "bitrate": 130677, "url": "https://cdn/audio-high" },
            // Opus/WebM has the higher bitrate, but Chromium/WebKit reject this
            // container from googlevideo (MEDIA_ELEMENT_ERROR: Format error), so
            // MP4/AAC wins even when it is smaller.
            { "itag": 251, "mimeType": "audio/webm; codecs=\"opus\"", "bitrate": 169000, "url": "https://cdn/audio-opus" }
        ] }
    });

    let stream = parse_stream(&payload).expect("parse stream");

    assert_eq!(stream.audio_url, "https://cdn/audio-high");
    assert_eq!(stream.itag, 140);
    assert_eq!(stream.duration, 213);
    assert_eq!(stream.title, "Song");
    assert_eq!(stream.author, "Artist");
}

#[test]
fn stream_rejects_payload_without_audio_format() {
    let payload = json!({
        "playabilityStatus": { "status": "OK" },
        "videoDetails": { "videoId": "vid-x" },
        "streamingData": { "adaptiveFormats": [
            { "itag": 137, "mimeType": "video/mp4", "bitrate": 4334157, "url": "https://cdn/video" }
        ] }
    });

    let error = parse_stream(&payload).expect_err("want a no-audio error");

    assert!(error.contains("vid-x"), "error must carry the video id: {error}");
}

#[test]
fn stream_rejects_unplayable_payload_with_reason() {
    let payload = json!({
        "playabilityStatus": { "status": "UNPLAYABLE", "reason": "Video unavailable" },
        "videoDetails": { "videoId": "vid-x" }
    });

    let error = parse_stream(&payload).expect_err("want a playability error");

    assert!(error.contains("UNPLAYABLE"), "error must carry the status: {error}");
    assert!(error.contains("Video unavailable"), "error must carry the reason: {error}");
}

#[test]
fn suggestions_join_every_run_of_the_row() {
    let suggestion: String = Sentence(1..3).fake();
    let payload = json!({ "contents": [ { "searchSuggestionsSectionRenderer": { "contents": [
        { "searchSuggestionRenderer": { "suggestion": runs(&["daft ", &suggestion]) } }
    ] } } ] });

    let suggestions = parse_suggestions(&payload).expect("parse suggestions");

    assert_eq!(suggestions.len(), 1);
    assert!(suggestions[0].ends_with(&suggestion), "got {:?}", suggestions[0]);
}

#[test]
fn guide_reads_label_and_browse_id() {
    let label: String = Sentence(1..2).fake();
    let payload = json!({ "items": [ { "guideSectionRenderer": { "items": [
        { "guideEntryRenderer": {
            "formattedTitle": runs(&[&label]),
            "navigationEndpoint": { "browseEndpoint": { "browseId": "FEmusic_home" } }
        } }
    ] } } ] });

    let entries = parse_guide(&payload).expect("parse guide");

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].label, label);
    assert_eq!(entries[0].browse_id, "FEmusic_home");
}

#[test]
fn account_reads_display_name() {
    let name: String = Name().fake();
    let payload = json!({ "actions": [ { "openPopupAction": { "popup": { "multiPageMenuRenderer": {
        "header": { "activeAccountHeaderRenderer": { "accountName": runs(&[&name]) } }
    } } } } ] });

    let account = parse_account(&payload).expect("parse account");

    assert_eq!(account.display_name, name);
}

#[test]
fn account_is_empty_for_anonymous_payload() {
    let account = parse_account(&json!({})).expect("parse empty account");

    assert!(account.display_name.is_empty(), "got {:?}", account.display_name);
}
