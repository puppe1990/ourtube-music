use fake::faker::lorem::en::Word;
use fake::faker::name::en::Name;
use fake::Fake;
use ourtube_music::innertube::parsers::parse_search_feed;
use serde_json::{json, Value};

fn runs(texts: &[&str]) -> Value {
    json!({ "runs": texts.iter().map(|text| json!({ "text": text })).collect::<Vec<_>>() })
}

fn thumbs(urls: &[&str]) -> Value {
    json!({
        "thumbnails": urls.iter().map(|url| json!({ "url": url, "width": 60, "height": 60 })).collect::<Vec<_>>()
    })
}

fn chip(label: &str, params: &str, selected: bool) -> Value {
    json!({
        "chipCloudChipRenderer": {
            "text": runs(&[label]),
            "isSelected": selected,
            "navigationEndpoint": { "searchEndpoint": { "query": "q", "params": params } }
        }
    })
}

fn song_row(video_id: &str, title: &str, artist: &str, plays: &str) -> Value {
    json!({
        "musicResponsiveListItemRenderer": {
            "thumbnail": { "musicThumbnailRenderer": { "thumbnail": thumbs(&["https://img/song"]) } },
            "flexColumns": [
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[title]) } },
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&["Música • ", artist]) } },
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[plays]) } }
            ],
            "playlistItemData": { "videoId": video_id },
            "overlay": { "musicItemThumbnailOverlayRenderer": { "content": {
                "musicPlayButtonRenderer": { "playNavigationEndpoint": { "watchEndpoint": {
                    "videoId": video_id,
                    "watchEndpointMusicSupportedConfigs": {
                        "watchEndpointMusicConfig": { "musicVideoType": "MUSIC_VIDEO_TYPE_ATV" }
                    }
                } } }
            } } }
        }
    })
}

fn artist_row(browse_id: &str, title: &str, subtitle: &str) -> Value {
    json!({
        "musicResponsiveListItemRenderer": {
            "thumbnail": { "musicThumbnailRenderer": {
                "thumbnail": thumbs(&["https://img/artist"]),
                "thumbnailCrop": "MUSIC_THUMBNAIL_CROP_CIRCLE"
            } },
            "flexColumns": [
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[title]) } },
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[subtitle]) } }
            ],
            "navigationEndpoint": { "browseEndpoint": {
                "browseId": browse_id,
                "browseEndpointContextSupportedConfigs": {
                    "browseEndpointContextMusicConfig": { "pageType": "MUSIC_PAGE_TYPE_ARTIST" }
                }
            } }
        }
    })
}

fn item_section(row: Value) -> Value {
    json!({ "itemSectionRenderer": { "contents": [row] } })
}

#[test]
fn search_feed_reads_tabs_chips_top_card_and_mixed_rows() {
    let album_title: String = Word().fake();
    let artist_name: String = Name().fake();
    let song_title: String = Word().fake();
    let browse_id = "MPREb_feedAlbum12";
    let playlist_id = "OLAK5uy_feedPlay12";
    let artist_id = "UCfeedArtistChannel12xxxx";
    let video_id = "songVid12ab";
    let library_id = "libVid12abc";
    let payload = json!({
        "contents": { "tabbedSearchResultsRenderer": { "tabs": [
            { "tabRenderer": {
                "title": "YT Music",
                "selected": true,
                "content": { "sectionListRenderer": {
                    "header": { "chipCloudRenderer": { "chips": [
                        chip("Álbuns", "EgWKAQIYAWoQEAkQBRADEAQQEBAKEBUQEQ%3D%3D", false),
                        chip("Músicas", "EgWKAQIIAWoQEAkQBRADEAQQEBAKEBUQEQ%3D%3D", false)
                    ] } },
                    "contents": [
                        { "musicCardShelfRenderer": {
                            "title": runs(&[&album_title]),
                            "subtitle": runs(&["Álbum • ", &artist_name, " • 2005"]),
                            "thumbnail": { "musicThumbnailRenderer": { "thumbnail": thumbs(&["https://img/top"]) } },
                            "onTap": { "browseEndpoint": {
                                "browseId": browse_id,
                                "browseEndpointContextSupportedConfigs": {
                                    "browseEndpointContextMusicConfig": { "pageType": "MUSIC_PAGE_TYPE_ALBUM" }
                                }
                            } },
                            "buttons": [
                                { "buttonRenderer": {
                                    "text": runs(&["Reproduzir"]),
                                    "icon": { "iconType": "PLAY_ARROW" },
                                    "command": { "watchPlaylistEndpoint": { "playlistId": playlist_id } }
                                } },
                                { "buttonRenderer": {
                                    "text": runs(&["Aleatório"]),
                                    "icon": { "iconType": "MUSIC_SHUFFLE" },
                                    "command": { "watchPlaylistEndpoint": { "playlistId": playlist_id } }
                                } }
                            ]
                        } },
                        item_section(artist_row(artist_id, &artist_name, "Artista • 6,66 mi ouvintes mensais")),
                        item_section(song_row(video_id, &song_title, &artist_name, "Tocou 2,4 mi vezes"))
                    ]
                } }
            } },
            { "tabRenderer": {
                "title": "Biblioteca",
                "selected": false,
                "endpoint": { "searchEndpoint": { "query": "q", "params": "agIYBA%3D%3D" } },
                "content": { "sectionListRenderer": { "contents": [
                    item_section(song_row(library_id, "Hidden", "Other", "Tocou 1 vez"))
                ] } }
            } }
        ] } }
    });

    let feed = parse_search_feed(&payload).expect("parse search feed");

    assert_eq!(feed.tabs.len(), 2);
    assert_eq!(feed.tabs[0].label, "YT Music");
    assert!(feed.tabs[0].selected);
    assert_eq!(feed.tabs[0].params, "");
    assert_eq!(feed.tabs[1].label, "Biblioteca");
    assert_eq!(feed.tabs[1].params, "agIYBA==");

    assert_eq!(feed.chips.len(), 2);
    assert_eq!(feed.chips[0].label, "Álbuns");
    assert_eq!(feed.chips[0].params, "EgWKAQIYAWoQEAkQBRADEAQQEBAKEBUQEQ==");

    let top = feed.top.expect("top result");
    assert_eq!(top.title, album_title);
    assert_eq!(top.browse_id, browse_id);
    assert_eq!(top.playlist_id, playlist_id);
    assert_eq!(top.result_type, "album");
    assert_eq!(top.thumbnail, "https://img/top");

    assert_eq!(feed.items.len(), 2);
    assert_eq!(feed.items[0].result_type, "artist");
    assert_eq!(feed.items[0].browse_id, artist_id);
    assert_eq!(feed.items[0].video_id, "");
    assert_eq!(feed.items[1].result_type, "song");
    assert_eq!(feed.items[1].video_id, video_id);
    assert_eq!(feed.items[1].artist, artist_name);
    assert!(
        !feed.items.iter().any(|item| item.video_id == library_id),
        "library tab rows leaked into catalog items: {:?}",
        feed.items
    );
}

#[test]
fn search_feed_skips_empty_reset_chip() {
    let title: String = Word().fake();
    let payload = json!({
        "contents": { "tabbedSearchResultsRenderer": { "tabs": [ { "tabRenderer": {
            "title": "YT Music",
            "selected": true,
            "content": { "sectionListRenderer": {
                "header": { "chipCloudRenderer": { "chips": [
                    chip("", "agIYAQ%3D%3D", false),
                    chip("Músicas", "EgWKAQIIAWoQEAkQBRADEAQQEBAKEBUQEQ%3D%3D", true)
                ] } },
                "contents": [ { "musicShelfRenderer": {
                    "title": runs(&["Músicas"]),
                    "contents": [song_row("vid-song-1", &title, "Artist", "Tocou 1 vez")]
                } } ]
            } }
        } } ] } }
    });

    let feed = parse_search_feed(&payload).expect("parse filtered search");

    assert!(feed.top.is_none());
    assert_eq!(feed.chips.len(), 1);
    assert_eq!(feed.chips[0].label, "Músicas");
    assert!(feed.chips[0].selected);
    assert_eq!(feed.items.len(), 1);
    assert_eq!(feed.items[0].title, title);
}

fn linked_run(text: &str, browse_id: &str) -> Value {
    json!({
        "text": text,
        "navigationEndpoint": { "browseEndpoint": { "browseId": browse_id } }
    })
}

fn linked_song_row(
    video_id: &str,
    title: &str,
    artist: &str,
    album: &str,
    artist_id: &str,
    album_id: &str,
) -> Value {
    json!({
        "musicResponsiveListItemRenderer": {
            "thumbnail": { "musicThumbnailRenderer": { "thumbnail": thumbs(&["https://img/song"]) } },
            "flexColumns": [
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&[title]) } },
                { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [
                    { "text": "Música • " },
                    linked_run(artist, artist_id),
                    { "text": " • " },
                    linked_run(album, album_id)
                ] } } },
                { "musicResponsiveListItemFlexColumnRenderer": { "text": runs(&["Tocou 1 mi vezes"]) } }
            ],
            "playlistItemData": { "videoId": video_id },
            "overlay": { "musicItemThumbnailOverlayRenderer": { "content": {
                "musicPlayButtonRenderer": { "playNavigationEndpoint": { "watchEndpoint": {
                    "videoId": video_id,
                    "watchEndpointMusicSupportedConfigs": {
                        "watchEndpointMusicConfig": { "musicVideoType": "MUSIC_VIDEO_TYPE_ATV" }
                    }
                } } }
            } } }
        }
    })
}

#[test]
fn search_song_rows_keep_album_and_artist_browse_ids_from_byline_runs() {
    let title: String = Word().fake();
    let artist: String = Name().fake();
    let album: String = Word().fake();
    let video_id = "exkCfsrNh5Q";
    let artist_id = "UCWtLCpuYDZOsurj1FdkXGnw";
    let album_id = "MPREb_genesisAlbum";
    let payload = json!({
        "contents": { "tabbedSearchResultsRenderer": { "tabs": [ { "tabRenderer": {
            "selected": true,
            "content": { "sectionListRenderer": { "contents": [
                item_section(linked_song_row(&video_id, &title, &artist, &album, artist_id, album_id))
            ] } }
        } } ] } }
    });

    let feed = parse_search_feed(&payload).expect("parse linked search song");
    let track = &feed.items[0];
    assert_eq!(track.video_id, video_id);
    assert_eq!(track.artist, artist);
    assert_eq!(track.album, album);
    assert_eq!(track.artist_browse_id, artist_id);
    assert_eq!(track.album_browse_id, album_id);
    assert_eq!(track.browse_id, "");
}
