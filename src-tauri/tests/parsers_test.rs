use fake::faker::lorem::en::Sentence;
use fake::faker::name::en::Name;
use fake::Fake;
use ourtube_music::innertube::parsers::{
    parse_account, parse_guide, parse_home_feed, parse_home_shelves, parse_list_accounts,
    parse_queue, parse_search_results, parse_stream, parse_suggestions,
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

fn play_overlay_watch_playlist(playlist_id: &str) -> Value {
    json!({
        "musicItemThumbnailOverlayRenderer": {
            "content": {
                "musicPlayButtonRenderer": {
                    "playNavigationEndpoint": {
                        "watchPlaylistEndpoint": { "playlistId": playlist_id }
                    }
                }
            }
        }
    })
}

fn play_overlay_watch(video_id: &str, playlist_id: &str) -> Value {
    json!({
        "musicItemThumbnailOverlayRenderer": {
            "content": {
                "musicPlayButtonRenderer": {
                    "playNavigationEndpoint": {
                        "watchEndpoint": { "videoId": video_id, "playlistId": playlist_id }
                    }
                }
            }
        }
    })
}

#[test]
fn home_shelves_keep_mix_cards_from_the_play_overlay() {
    // Official YTM mixtapes (Minha Mix, mood playlists) are two-row cards
    // with browseEndpoint + thumbnailOverlay.watchPlaylistEndpoint, not a
    // watchEndpoint.videoId (probed 2026-11-05 on FEmusic_home).
    let shelf_title: String = Sentence(1..3).fake();
    let mix_title: String = Sentence(1..3).fake();
    let artist: String = Name().fake();
    let suffix: String = Name().fake();
    let playlist_id = format!("RDCLAK5uy_{suffix}");
    let browse_id = format!("VL{playlist_id}");

    let payload = json!({ "contents": { "sectionListRenderer": { "contents": [ { "musicCarouselShelfRenderer": {
        "header": { "musicCarouselShelfBasicHeaderRenderer": { "title": runs(&[&shelf_title]) } },
        "contents": [ { "musicTwoRowItemRenderer": {
            "title": runs(&[&mix_title]),
            "subtitle": runs(&[&artist]),
            "thumbnailRenderer": { "musicThumbnailRenderer": { "thumbnail": thumbnails(&["https://img/mix"]) } },
            "navigationEndpoint": { "browseEndpoint": { "browseId": browse_id } },
            "thumbnailOverlay": play_overlay_watch_playlist(&playlist_id)
        } } ]
    } } ] } } });

    let shelves = parse_home_shelves(&payload).expect("parse home mix");

    assert_eq!(shelves.len(), 1, "want the mix shelf, got {shelves:?}");
    assert_eq!(shelves[0].title, shelf_title);
    assert_eq!(shelves[0].tracks.len(), 1);
    assert_eq!(shelves[0].tracks[0].title, mix_title);
    assert_eq!(shelves[0].tracks[0].artist, artist);
    assert_eq!(shelves[0].tracks[0].playlist_id, playlist_id);
    assert!(shelves[0].tracks[0].video_id.is_empty());
}

#[test]
fn home_shelves_keep_album_cards_from_the_play_overlay() {
    let album: String = Sentence(1..3).fake();
    let artist: String = Name().fake();
    let suffix: String = Name().fake();
    let playlist_id = format!("OLAK5uy_{suffix}");
    let browse_id = format!("MPREb_{suffix}");

    let payload = json!({ "contents": { "sectionListRenderer": { "contents": [ { "musicCarouselShelfRenderer": {
        "header": { "musicCarouselShelfBasicHeaderRenderer": { "title": runs(&["Ouvir de novo"]) } },
        "contents": [ { "musicTwoRowItemRenderer": {
            "title": runs(&[&album]),
            "subtitle": runs(&[&artist, " • Álbum"]),
            "thumbnailRenderer": { "musicThumbnailRenderer": { "thumbnail": thumbnails(&["https://img/album"]) } },
            "navigationEndpoint": { "browseEndpoint": { "browseId": browse_id } },
            "thumbnailOverlay": play_overlay_watch_playlist(&playlist_id)
        } } ]
    } } ] } } });

    let shelves = parse_home_shelves(&payload).expect("parse home album");

    assert_eq!(shelves[0].tracks[0].title, album);
    assert_eq!(shelves[0].tracks[0].playlist_id, playlist_id);
    assert_eq!(shelves[0].tracks[0].artist, artist);
}

#[test]
fn home_feed_reads_mood_chips_and_the_continuation_token() {
    let chip: String = Sentence(1..2).fake();
    let params: String = Name().fake();
    let token: String = Name().fake();

    let payload = json!({
        "contents": { "singleColumnBrowseResultsRenderer": { "tabs": [ { "tabRenderer": {
            "content": { "sectionListRenderer": {
                "header": { "chipCloudRenderer": { "chips": [ { "chipCloudChipRenderer": {
                    "text": runs(&[&chip]),
                    "navigationEndpoint": { "browseEndpoint": { "browseId": "FEmusic_home", "params": params } },
                    "isSelected": true
                } } ] } },
                "contents": [],
                "continuations": [ { "nextContinuationData": { "continuation": token } } ]
            } }
        } } ] } }
    });

    let feed =
        ourtube_music::innertube::parsers::parse_home_feed(&payload).expect("parse home feed");

    assert_eq!(
        feed.chips.len(),
        1,
        "want the mood chip, got {:?}",
        feed.chips
    );
    assert_eq!(feed.chips[0].label, chip);
    assert_eq!(feed.chips[0].params, params);
    assert!(feed.chips[0].selected);
    assert_eq!(feed.continuation, token);
}

#[test]
fn library_feed_keeps_the_signed_out_message() {
    let heading: String = Sentence(1..3).fake();
    let message: String = Sentence(8..16).fake();
    let payload = json!({
        "contents": { "singleColumnBrowseResultsRenderer": { "tabs": [ { "tabRenderer": {
            "content": { "sectionListRenderer": { "contents": [ { "itemSectionRenderer": { "contents": [
                { "messageRenderer": {
                    "text": runs(&[&heading]),
                    "subtext": { "messageSubtextRenderer": { "text": runs(&[&message]) } }
                } }
            ] } } ] } }
        } } ] } }
    });

    let feed = ourtube_music::innertube::parsers::parse_home_feed(&payload).expect("parse library");

    assert!(feed.shelves.is_empty());
    assert_eq!(feed.message, message);
}

#[test]
fn library_shelves_keep_music_shelf_rows() {
    let shelf_title: String = Sentence(1..3).fake();
    let title: String = Sentence(1..3).fake();
    let payload = json!({ "contents": { "sectionListRenderer": { "contents": [
        { "musicShelfRenderer": {
            "title": runs(&[&shelf_title]),
            "contents": [responsive_track("lib-1", &title, "Artist • Album", "3:21")]
        } }
    ] } } });

    let shelves = parse_home_shelves(&payload).expect("parse library shelf");

    assert_eq!(shelves.len(), 1);
    assert_eq!(shelves[0].title, shelf_title);
    assert_eq!(shelves[0].tracks[0].video_id, "lib-1");
    assert_eq!(shelves[0].tracks[0].title, title);
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
fn stream_exposes_the_progressive_muxed_format_as_fallback() {
    let payload = json!({
        "playabilityStatus": { "status": "OK" },
        "videoDetails": { "videoId": "vid-x", "title": "Song", "author": "Artist", "lengthSeconds": "180" },
        "streamingData": {
            "formats": [
                { "itag": 18, "mimeType": "video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"", "bitrate": 300000, "url": "https://cdn/muxed" }
            ],
            "adaptiveFormats": [
                { "itag": 140, "mimeType": "audio/mp4; codecs=\"mp4a.40.2\"", "bitrate": 130000, "url": "https://cdn/audio" }
            ]
        }
    });

    let stream = parse_stream(&payload).expect("parse stream");

    assert_eq!(stream.audio_url, "https://cdn/audio");
    assert_eq!(stream.fallback_url, "https://cdn/muxed");
    assert_eq!(stream.fallback_itag, 18);
}

#[test]
fn stream_accepts_an_android_payload_that_only_ships_muxed_itag_18() {
    let payload = json!({
        "playabilityStatus": { "status": "OK" },
        "videoDetails": { "videoId": "vid-x", "title": "Song", "author": "Artist", "lengthSeconds": "180" },
        "streamingData": {
            "formats": [
                { "itag": 18, "mimeType": "video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"", "bitrate": 300000, "url": "https://cdn/muxed" }
            ]
        }
    });

    let stream = parse_stream(&payload).expect("parse muxed-only stream");

    assert_eq!(stream.audio_url, "https://cdn/muxed");
    assert_eq!(stream.itag, 18);
    assert_eq!(stream.fallback_url, "https://cdn/muxed");
    assert_eq!(stream.fallback_itag, 18);
}

#[test]
fn stream_without_muxed_format_has_no_fallback() {
    let payload = json!({
        "playabilityStatus": { "status": "OK" },
        "videoDetails": { "videoId": "vid-x" },
        "streamingData": { "adaptiveFormats": [
            { "itag": 140, "mimeType": "audio/mp4", "bitrate": 130000, "url": "https://cdn/audio" }
        ] }
    });

    let stream = parse_stream(&payload).expect("parse stream");

    assert!(stream.fallback_url.is_empty());
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

    assert!(
        error.contains("vid-x"),
        "error must carry the video id: {error}"
    );
}

#[test]
fn stream_rejects_unplayable_payload_with_reason() {
    let payload = json!({
        "playabilityStatus": { "status": "UNPLAYABLE", "reason": "Video unavailable" },
        "videoDetails": { "videoId": "vid-x" }
    });

    let error = parse_stream(&payload).expect_err("want a playability error");

    assert!(
        error.contains("UNPLAYABLE"),
        "error must carry the status: {error}"
    );
    assert!(
        error.contains("Video unavailable"),
        "error must carry the reason: {error}"
    );
}

#[test]
fn suggestions_join_every_run_of_the_row() {
    let suggestion: String = Sentence(1..3).fake();
    let payload = json!({ "contents": [ { "searchSuggestionsSectionRenderer": { "contents": [
        { "searchSuggestionRenderer": { "suggestion": runs(&["daft ", &suggestion]) } }
    ] } } ] });

    let suggestions = parse_suggestions(&payload).expect("parse suggestions");

    assert_eq!(suggestions.len(), 1);
    assert!(
        suggestions[0].ends_with(&suggestion),
        "got {:?}",
        suggestions[0]
    );
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
    assert!(account.email.is_empty(), "got {:?}", account.email);
}

#[test]
fn account_reads_the_connected_google_email() {
    let name: String = Name().fake();
    let email = format!(
        "{}@gmail.com",
        Name().fake::<String>().replace(' ', "").to_lowercase()
    );
    let payload = json!({ "actions": [ { "openPopupAction": { "popup": { "multiPageMenuRenderer": {
        "header": { "activeAccountHeaderRenderer": {
            "accountName": runs(&[&name]),
            "email": runs(&[&email])
        } }
    } } } } ] });

    let account = parse_account(&payload).expect("parse account");

    assert_eq!(account.display_name, name);
    assert_eq!(account.email, email);
}

#[test]
fn account_reads_email_from_simple_text() {
    let email = format!(
        "{}@hotmail.com",
        Name().fake::<String>().replace(' ', "").to_lowercase()
    );
    let payload = json!({ "actions": [ { "openPopupAction": { "popup": { "multiPageMenuRenderer": {
        "header": { "activeAccountHeaderRenderer": {
            "accountName": { "simpleText": Name().fake::<String>() },
            "email": { "simpleText": email }
        } }
    } } } } ] });

    let account = parse_account(&payload).expect("parse account");

    assert_eq!(account.email, email);
}

#[test]
fn account_is_empty_for_anonymous_payload() {
    let account = parse_account(&json!({})).expect("parse empty account");

    assert!(
        account.display_name.is_empty(),
        "got {:?}",
        account.display_name
    );
    assert!(account.email.is_empty(), "got {:?}", account.email);
}

#[test]
fn list_accounts_reads_the_connected_google_email() {
    let name: String = Name().fake();
    let email = format!(
        "{}@gmail.com",
        Name().fake::<String>().replace(' ', "").to_lowercase()
    );
    let payload = json!([
        "gaia.l.a.r",
        [["gaia.l.a", 1, name, email, "https://lh3.example/photo", 0]]
    ]);

    let account = parse_list_accounts(&payload).expect("parse list accounts");

    assert_eq!(account.display_name, name);
    assert_eq!(account.email, email);
    assert_eq!(account.photo_url, "https://lh3.example/photo");
}

#[test]
fn list_accounts_is_empty_when_google_returns_no_rows() {
    let account = parse_list_accounts(&json!(["gaia.l.a.r", []])).expect("parse empty list");

    assert!(
        account.display_name.is_empty(),
        "got {:?}",
        account.display_name
    );
    assert!(account.email.is_empty(), "got {:?}", account.email);
}

#[test]
fn account_reads_channel_handle_and_avatar() {
    let name: String = Name().fake();
    let handle = format!("@{}", Name().fake::<String>().replace(' ', ""));
    let photo = "https://yt3.example/avatar";
    let payload = json!({ "actions": [ { "openPopupAction": { "popup": { "multiPageMenuRenderer": {
        "header": { "activeAccountHeaderRenderer": {
            "accountName": runs(&[&name]),
            "channelHandle": { "simpleText": handle },
            "accountPhoto": { "thumbnails": [{ "url": photo, "width": 48, "height": 48 }] }
        } }
    } } } } ] });

    let account = parse_account(&payload).expect("parse account");

    assert_eq!(account.display_name, name);
    assert_eq!(account.handle, handle);
    assert_eq!(account.photo_url, photo);
}

#[test]
fn home_album_cards_keep_the_mpreb_browse_id_next_to_the_overlay_video() {
    let album: String = Sentence(1..3).fake();
    let artist: String = Name().fake();
    let suffix: String = Name().fake();
    let browse_id = format!("MPREb_{suffix}");
    let playlist_id = format!("OLAK5uy_{suffix}");
    let video_id: String = Name().fake();

    let payload = json!({ "contents": { "sectionListRenderer": { "contents": [ { "musicCarouselShelfRenderer": {
        "header": { "musicCarouselShelfBasicHeaderRenderer": { "title": runs(&["Ouvir de novo"]) } },
        "contents": [ { "musicTwoRowItemRenderer": {
            "title": runs(&[&album]),
            "subtitle": runs(&["Álbum", " • ", &artist]),
            "thumbnailRenderer": { "musicThumbnailRenderer": { "thumbnail": thumbnails(&["https://img/album"]) } },
            "navigationEndpoint": { "browseEndpoint": { "browseId": browse_id } },
            "thumbnailOverlay": play_overlay_watch(&video_id, &playlist_id)
        } } ]
    } } ] } } });

    let shelves = parse_home_shelves(&payload).expect("parse home album card");
    let track = &shelves[0].tracks[0];

    assert_eq!(track.title, album);
    assert_eq!(track.artist, artist);
    assert_eq!(track.browse_id, browse_id);
    assert_eq!(track.playlist_id, playlist_id);
    assert_eq!(track.video_id, video_id);
}

#[test]
fn album_browse_feed_reads_the_header_then_the_tracklist() {
    let album: String = Sentence(1..3).fake();
    let artist: String = Name().fake();
    let year = "2016";
    let playlist_id: String = format!("OLAK5uy_{}", Name().fake::<String>());
    let first_title: String = Sentence(1..3).fake();
    let first_id: String = Name().fake();
    let related: String = Sentence(1..2).fake();
    let play_count = "Tocou 452 mil vezes";

    let payload = json!({
        "contents": {
            "musicResponsiveHeaderRenderer": {
                "thumbnail": { "musicThumbnailRenderer": { "thumbnail": thumbnails(&["https://img/cover"]) } },
                "title": runs(&[&album]),
                "subtitle": runs(&["Álbum", " • ", year]),
                "straplineTextOne": runs(&[&artist]),
                "secondSubtitle": runs(&["11 músicas", " • ", "48 minutos"]),
                "buttons": [{ "musicPlayButtonRenderer": { "playNavigationEndpoint": {
                    "watchEndpoint": { "videoId": first_id, "playlistId": playlist_id }
                } } }]
            },
            "musicCarouselShelfRenderer": {
                "header": { "musicCarouselShelfBasicHeaderRenderer": { "title": runs(&[&related]) } },
                "contents": [ { "musicTwoRowItemRenderer": {
                    "title": runs(&["Related"]),
                    "subtitle": runs(&[&artist, " • Álbum"]),
                    "thumbnailRenderer": { "musicThumbnailRenderer": { "thumbnail": thumbnails(&["https://img/rel"]) } },
                    "navigationEndpoint": { "browseEndpoint": { "browseId": "MPREb_related" } },
                    "thumbnailOverlay": play_overlay_watch_playlist("OLAK5uy_rel")
                } } ]
            },
            "musicShelfRenderer": {
                "contents": [{ "musicResponsiveListItemRenderer": {
                    "flexColumns": [
                        { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[&first_title]) } },
                        { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[]) } },
                        { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[play_count]) } }
                    ],
                    "fixedColumns": [
                        { "musicResponsiveListItemFixedColumnRenderer": { "text": runs(&["3:10"]) } }
                    ],
                    "playlistItemData": { "videoId": first_id },
                    "overlay": play_overlay_watch(&first_id, &playlist_id)
                } }]
            }
        }
    });

    let feed = parse_home_feed(&payload).expect("parse album page");
    let header = feed.header.expect("album header");

    assert_eq!(header.title, album);
    assert_eq!(header.artist, artist);
    assert_eq!(header.subtitle, "Álbum • 2016");
    assert_eq!(header.second_subtitle, "11 músicas • 48 minutos");
    assert_eq!(header.thumbnail, "https://img/cover");
    assert_eq!(header.playlist_id, playlist_id);
    assert_eq!(header.video_id, first_id);
    assert_eq!(feed.shelves[0].tracks[0].title, first_title);
    assert_eq!(feed.shelves[0].tracks[0].duration, "3:10");
    assert_eq!(feed.shelves[0].tracks[0].play_count, play_count);
    assert_eq!(feed.shelves[0].tracks[0].playlist_id, playlist_id);
    assert_eq!(feed.shelves[0].tracks[0].artist, artist);
    assert_eq!(feed.shelves[0].tracks[0].album, album);
    assert_eq!(feed.shelves[1].title, related);
}
