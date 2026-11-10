use serde::Deserialize;
use serde_json::Value;

use crate::innertube::models::{
    Account, BrowseHeader, GuideEntry, HomeChip, HomeFeed, Lyrics, SearchFeed, SearchTop, Shelf,
    Stream, Track,
};

pub fn parse_search_results(payload: &Value) -> Result<Vec<Track>, String> {
    Ok(parse_search_feed(payload)?.items)
}

pub fn parse_search_feed(payload: &Value) -> Result<SearchFeed, String> {
    let selected = selected_search_tab(payload);
    Ok(SearchFeed {
        tabs: parse_search_tabs(payload),
        chips: parse_search_chips(selected),
        top: find_nodes(selected, "musicCardShelfRenderer")
            .into_iter()
            .next()
            .and_then(parse_search_top),
        items: find_nodes(selected, "musicResponsiveListItemRenderer")
            .into_iter()
            .filter_map(search_item)
            .collect(),
    })
}

fn selected_search_tab(payload: &Value) -> &Value {
    let tabs = search_tab_renderers(payload);
    tabs.iter()
        .copied()
        .find(|tab| tab.get("selected").and_then(Value::as_bool) == Some(true))
        .or_else(|| tabs.first().copied())
        .unwrap_or(payload)
}

fn search_tab_renderers(payload: &Value) -> Vec<&Value> {
    let root = find_nodes(payload, "tabbedSearchResultsRenderer")
        .into_iter()
        .next();
    array_items(root.and_then(|node| node.get("tabs")))
        .iter()
        .filter_map(|item| item.get("tabRenderer"))
        .collect()
}

fn parse_search_tabs(payload: &Value) -> Vec<HomeChip> {
    search_tab_renderers(payload)
        .into_iter()
        .filter_map(|tab| {
            let label = tab
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            if label.is_empty() {
                return None;
            }
            let endpoint = tab
                .get("endpoint")
                .or_else(|| tab.get("navigationEndpoint"));
            Some(HomeChip {
                label,
                params: decode_params(&string_field(
                    endpoint.and_then(|node| field(node, &["searchEndpoint"])),
                    "params",
                )),
                browse_id: String::new(),
                selected: tab
                    .get("selected")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .collect()
}

fn parse_search_chips(tab: &Value) -> Vec<HomeChip> {
    find_nodes(tab, "chipCloudChipRenderer")
        .into_iter()
        .filter_map(|row| {
            let label = join_runs(row.get("text"));
            if label.is_empty() {
                return None;
            }
            Some(HomeChip {
                label,
                params: decode_params(&string_field(
                    field(row, &["navigationEndpoint", "searchEndpoint"]),
                    "params",
                )),
                browse_id: String::new(),
                selected: row
                    .get("isSelected")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .collect()
}

fn parse_search_top(node: &Value) -> Option<SearchTop> {
    let title = join_runs(node.get("title"));
    if title.is_empty() {
        return None;
    }
    let subtitle = join_runs(node.get("subtitle"));
    let browse = node
        .get("onTap")
        .and_then(|node| field(node, &["browseEndpoint"]));
    let (video_id, playlist_id, shuffle_playlist_id) = search_top_play(node);
    Some(SearchTop {
        title,
        subtitle: subtitle.clone(),
        thumbnail: largest_thumbnail(field(
            node,
            &["thumbnail", "musicThumbnailRenderer", "thumbnail"],
        )),
        browse_id: string_field(browse, "browseId"),
        video_id,
        playlist_id,
        shuffle_playlist_id,
        result_type: result_type_from(&browse_page_type(browse), "", &subtitle),
    })
}

fn search_top_play(node: &Value) -> (String, String, String) {
    let mut video_id = String::new();
    let mut playlist_id = String::new();
    let mut shuffle_playlist_id = String::new();
    for button in array_items(node.get("buttons")) {
        let renderer = button.get("buttonRenderer").unwrap_or(button);
        let Some(endpoint) = renderer
            .get("command")
            .or_else(|| renderer.get("navigationEndpoint"))
        else {
            continue;
        };
        let icon = string_field(field(renderer, &["icon"]), "iconType");
        let list_id = string_field(
            field(endpoint, &["watchPlaylistEndpoint"])
                .or_else(|| field(endpoint, &["watchEndpoint"])),
            "playlistId",
        );
        let watch_id = string_field(field(endpoint, &["watchEndpoint"]), "videoId");
        if icon == "MUSIC_SHUFFLE" {
            shuffle_playlist_id = list_id;
            if video_id.is_empty() {
                video_id = watch_id;
            }
        } else {
            if !list_id.is_empty() {
                playlist_id = list_id;
            }
            if !watch_id.is_empty() {
                video_id = watch_id;
            }
        }
    }
    if playlist_id.is_empty() {
        playlist_id = string_field(
            play_navigation(node).and_then(|endpoint| endpoint.get("watchPlaylistEndpoint")),
            "playlistId",
        );
    }
    if shuffle_playlist_id.is_empty() {
        shuffle_playlist_id = playlist_id.clone();
    }
    (video_id, playlist_id, shuffle_playlist_id)
}

fn search_item(node: &Value) -> Option<Track> {
    let mut video_id = string_field(node.get("playlistItemData"), "videoId");
    if video_id.is_empty() {
        video_id = overlay_video_id(node);
    }
    let playlist_id = overlay_playlist_id(node);
    let browse_id = catalog_browse_id(node);
    if video_id.is_empty() && playlist_id.is_empty() && browse_id.is_empty() {
        return None;
    }
    let texts = responsive_column_texts(node);
    let title = texts.first().cloned().unwrap_or_default();
    if title.is_empty() {
        return None;
    }
    let subtitle = texts
        .iter()
        .skip(1)
        .filter(|text| !text.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join(" • ");
    let page_type = browse_page_type(field(node, &["navigationEndpoint", "browseEndpoint"]));
    let video_type = watch_video_type(play_navigation(node));
    let result_type = result_type_from(&page_type, &video_type, &subtitle);
    let named = result_type == "artist" || result_type == "profile";
    let (artist, album) = if named {
        (String::new(), String::new())
    } else {
        search_byline(&title, &texts)
    };
    let (artist_browse_id, album_browse_id) = if named {
        (String::new(), String::new())
    } else {
        flex_catalog_ids(node)
    };
    Some(Track {
        video_id,
        playlist_id,
        browse_id,
        album_browse_id,
        artist_browse_id,
        title,
        artist,
        album,
        duration: texts
            .iter()
            .find(|text| looks_like_duration(text))
            .cloned()
            .unwrap_or_default(),
        thumbnail: largest_thumbnail(field(
            node,
            &["thumbnail", "musicThumbnailRenderer", "thumbnail"],
        )),
        play_count: texts
            .iter()
            .find(|text| looks_like_play_count(text))
            .cloned()
            .unwrap_or_default(),
        subtitle,
        result_type,
        ..Track::default()
    })
}

fn search_byline(title: &str, texts: &[String]) -> (String, String) {
    let extras: Vec<&str> = texts
        .iter()
        .map(String::as_str)
        .filter(|text| {
            !text.is_empty()
                && *text != title
                && !looks_like_duration(text)
                && !looks_like_play_count(text)
        })
        .collect();
    search_split_byline(extras.first().copied().unwrap_or(""))
}

fn search_split_byline(byline: &str) -> (String, String) {
    let parts: Vec<&str> = byline
        .split('•')
        .map(str::trim)
        .filter(|part| {
            !part.is_empty() && !looks_like_play_count(part) && !looks_like_duration(part)
        })
        .collect();
    if parts.is_empty() {
        return (String::new(), String::new());
    }
    if is_catalog_type(parts[0]) {
        return (
            parts.get(1).unwrap_or(&"").to_string(),
            parts[0].to_string(),
        );
    }
    if is_type_label(parts[0]) {
        return (
            parts.get(1).unwrap_or(&"").to_string(),
            parts.get(2).unwrap_or(&"").to_string(),
        );
    }
    (
        parts[0].to_string(),
        parts.get(1).unwrap_or(&"").to_string(),
    )
}

fn is_type_label(text: &str) -> bool {
    matches!(
        text.trim().to_lowercase().as_str(),
        "música"
            | "musica"
            | "song"
            | "vídeo"
            | "video"
            | "artista"
            | "artist"
            | "episódio"
            | "episodio"
            | "episode"
            | "perfil"
            | "profile"
            | "podcast"
    )
}

fn result_type_from(page_type: &str, video_type: &str, subtitle: &str) -> String {
    match page_type {
        "MUSIC_PAGE_TYPE_ALBUM" => return "album".into(),
        "MUSIC_PAGE_TYPE_ARTIST" => return "artist".into(),
        "MUSIC_PAGE_TYPE_USER_CHANNEL" | "MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_CHANNEL" => {
            return "profile".into()
        }
        "MUSIC_PAGE_TYPE_PLAYLIST" => return "playlist".into(),
        "MUSIC_PAGE_TYPE_PODCAST_SHOW" => return "podcast".into(),
        _ => {}
    }
    match video_type {
        "MUSIC_VIDEO_TYPE_ATV" => return "song".into(),
        "MUSIC_VIDEO_TYPE_OMV" | "MUSIC_VIDEO_TYPE_UGC" => return "video".into(),
        "MUSIC_VIDEO_TYPE_PODCAST_EPISODE" => return "episode".into(),
        _ => {}
    }
    let label = subtitle
        .split('•')
        .next()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    match label.as_str() {
        "álbum" | "album" | "ep" | "single" => "album",
        "música" | "musica" | "song" => "song",
        "artista" | "artist" => "artist",
        "vídeo" | "video" => "video",
        "episódio" | "episodio" | "episode" => "episode",
        "playlist" => "playlist",
        "perfil" | "profile" => "profile",
        "podcast" => "podcast",
        _ => "",
    }
    .into()
}

fn browse_page_type(browse: Option<&Value>) -> String {
    let Some(browse) = browse else {
        return String::new();
    };
    string_field(
        field(
            browse,
            &[
                "browseEndpointContextSupportedConfigs",
                "browseEndpointContextMusicConfig",
            ],
        ),
        "pageType",
    )
}

fn watch_video_type(play: Option<&Value>) -> String {
    let Some(play) = play else {
        return String::new();
    };
    string_field(
        field(
            play,
            &[
                "watchEndpoint",
                "watchEndpointMusicSupportedConfigs",
                "watchEndpointMusicConfig",
            ],
        ),
        "musicVideoType",
    )
}

fn decode_params(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                out.push((high << 4) | low);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| value.to_string())
}

fn from_hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn tracks_from_contents(contents: Option<&Value>) -> Vec<Track> {
    array_items(contents)
        .iter()
        .filter_map(|item| any_track(item))
        .collect()
}

fn push_shelf(shelves: &mut Vec<Shelf>, title: String, tracks: Vec<Track>) {
    push_shelf_full(shelves, title, tracks, String::new(), String::new());
}

fn push_shelf_with_layout(
    shelves: &mut Vec<Shelf>,
    title: String,
    tracks: Vec<Track>,
    layout: String,
) {
    push_shelf_full(shelves, title, tracks, layout, String::new());
}

fn push_shelf_full(
    shelves: &mut Vec<Shelf>,
    title: String,
    tracks: Vec<Track>,
    layout: String,
    more_browse_id: String,
) {
    if !tracks.is_empty() {
        shelves.push(Shelf {
            title,
            tracks,
            layout,
            more_browse_id,
        });
    }
}

fn carousel_more_browse_id(carousel: &Value) -> String {
    string_field(
        field(
            carousel,
            &[
                "header",
                "musicCarouselShelfBasicHeaderRenderer",
                "moreContentButton",
                "buttonRenderer",
                "navigationEndpoint",
                "browseEndpoint",
            ],
        ),
        "browseId",
    )
}

pub fn parse_home_shelves(payload: &Value) -> Result<Vec<Shelf>, String> {
    parse_home_shelves_ordered(payload, false)
}

fn parse_home_shelves_ordered(payload: &Value, lists_first: bool) -> Result<Vec<Shelf>, String> {
    let mut carousels = Vec::new();
    for carousel in find_nodes(payload, "musicCarouselShelfRenderer") {
        push_shelf_full(
            &mut carousels,
            join_runs(field(
                carousel,
                &["header", "musicCarouselShelfBasicHeaderRenderer", "title"],
            )),
            tracks_from_contents(carousel.get("contents")),
            String::new(),
            carousel_more_browse_id(carousel),
        );
    }
    let mut lists = Vec::new();
    for list in find_nodes(payload, "musicShelfRenderer") {
        push_shelf(
            &mut lists,
            join_runs(list.get("title")),
            tracks_from_contents(list.get("contents")),
        );
    }
    let mut grids = Vec::new();
    for grid in find_nodes(payload, "gridRenderer") {
        push_shelf_with_layout(
            &mut grids,
            join_runs(field(grid, &["header", "gridHeaderRenderer", "title"])),
            tracks_from_contents(grid.get("items")),
            "grid".to_string(),
        );
    }
    Ok(if lists_first {
        lists.extend(carousels);
        lists.extend(grids);
        lists
    } else {
        carousels.extend(lists);
        carousels.extend(grids);
        carousels
    })
}

fn parse_message(payload: &Value) -> String {
    let Some(row) = find_nodes(payload, "messageRenderer").into_iter().next() else {
        return String::new();
    };
    let sub = join_runs(field(row, &["subtext", "messageSubtextRenderer", "text"]));
    if sub.is_empty() {
        join_runs(row.get("text"))
    } else {
        sub
    }
}

pub fn parse_home_feed(payload: &Value) -> Result<HomeFeed, String> {
    let header = parse_browse_header(payload);
    let shelves = parse_home_shelves_ordered(payload, header.is_some())?;
    Ok(HomeFeed {
        chips: parse_chips(payload),
        shelves: enrich_album_tracks(header.as_ref(), shelves),
        continuation: parse_continuation(payload),
        message: parse_message(payload),
        header,
    })
}

fn parse_browse_header(payload: &Value) -> Option<BrowseHeader> {
    parse_album_header(payload).or_else(|| parse_artist_header(payload))
}

fn parse_album_header(payload: &Value) -> Option<BrowseHeader> {
    let node = find_nodes(payload, "musicResponsiveHeaderRenderer")
        .into_iter()
        .next()?;
    let title = join_runs(node.get("title"));
    if title.is_empty() {
        return None;
    }
    let play = find_nodes(node, "musicPlayButtonRenderer")
        .into_iter()
        .next()
        .and_then(|button| watch_endpoint(Some(button)));
    Some(BrowseHeader {
        title,
        artist: join_runs(node.get("straplineTextOne")),
        subtitle: join_runs(node.get("subtitle")),
        second_subtitle: join_runs(node.get("secondSubtitle")),
        thumbnail: largest_thumbnail(field(
            node,
            &["thumbnail", "musicThumbnailRenderer", "thumbnail"],
        )),
        artist_thumbnail: largest_thumbnail(field(
            node,
            &["straplineThumbnail", "musicThumbnailRenderer", "thumbnail"],
        )),
        playlist_id: string_field(play, "playlistId"),
        video_id: string_field(play, "videoId"),
        artist_browse_id: first_browse_id(node.get("straplineTextOne")),
        page_type: "album".to_string(),
        ..BrowseHeader::default()
    })
}

fn parse_artist_header(payload: &Value) -> Option<BrowseHeader> {
    let node = find_nodes(payload, "musicImmersiveHeaderRenderer")
        .into_iter()
        .next()?;
    let title = join_runs(node.get("title"));
    if title.is_empty() {
        return None;
    }
    let play = watch_endpoint(node.get("playButton"));
    let mix = watch_endpoint(node.get("startRadioButton"));
    Some(BrowseHeader {
        title: title.clone(),
        artist: title,
        thumbnail: largest_thumbnail(field(
            node,
            &["thumbnail", "musicThumbnailRenderer", "thumbnail"],
        )),
        playlist_id: string_field(play, "playlistId"),
        video_id: string_field(play, "videoId"),
        mix_playlist_id: string_field(mix, "playlistId"),
        mix_video_id: string_field(mix, "videoId"),
        subscriber_count: join_runs(field(
            node,
            &[
                "subscriptionButton",
                "subscribeButtonRenderer",
                "subscriberCountText",
            ],
        )),
        page_type: "artist".to_string(),
        ..BrowseHeader::default()
    })
}

fn enrich_album_tracks(header: Option<&BrowseHeader>, shelves: Vec<Shelf>) -> Vec<Shelf> {
    let Some(header) = header else {
        return shelves;
    };
    if header.page_type == "artist" {
        return shelves;
    }
    shelves
        .into_iter()
        .map(|mut shelf| {
            shelf.tracks = shelf
                .tracks
                .into_iter()
                .map(|mut track| {
                    if track.artist.is_empty() {
                        track.artist = header.artist.clone();
                    }
                    if track.album.is_empty() {
                        track.album = header.title.clone();
                    }
                    if track.thumbnail.is_empty() {
                        track.thumbnail = header.thumbnail.clone();
                    }
                    if track.playlist_id.is_empty() {
                        track.playlist_id = header.playlist_id.clone();
                    }
                    if track.artist_browse_id.is_empty() {
                        track.artist_browse_id = header.artist_browse_id.clone();
                    }
                    track
                })
                .collect();
            shelf
        })
        .collect()
}

fn chip_browse<'a>(row: &'a Value) -> Option<&'a Value> {
    let direct = field(row, &["navigationEndpoint", "browseEndpoint"]);
    if !string_field(direct, "browseId").is_empty() {
        return direct;
    }
    let commands = field(
        row,
        &["navigationEndpoint", "commandExecutorCommand", "commands"],
    );
    for command in array_items(commands) {
        let browse = command.get("browseEndpoint");
        if !string_field(browse, "browseId").is_empty() {
            return browse;
        }
    }
    direct
}

fn parse_chips(payload: &Value) -> Vec<HomeChip> {
    find_nodes(payload, "chipCloudChipRenderer")
        .iter()
        .filter_map(|row| {
            let label = join_runs(row.get("text"));
            if label.is_empty() {
                return None;
            }
            let browse = chip_browse(row);
            Some(HomeChip {
                label,
                params: string_field(browse, "params"),
                browse_id: string_field(browse, "browseId"),
                selected: row
                    .get("isSelected")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .collect()
}

fn parse_continuation(payload: &Value) -> String {
    let next = find_nodes(payload, "nextContinuationData")
        .first()
        .map(|row| string_field(Some(row), "continuation"))
        .filter(|token| !token.is_empty());
    if let Some(token) = next {
        return token;
    }
    find_nodes(payload, "continuationCommand")
        .first()
        .map(|row| string_field(Some(row), "token"))
        .unwrap_or_default()
}

pub fn parse_lyrics_browse_id(payload: &Value) -> String {
    for tab in find_nodes(payload, "tabRenderer") {
        if tab.get("unselectable").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        let Some(endpoint) = field(tab, &["endpoint", "browseEndpoint"])
            .or_else(|| field(tab, &["navigationEndpoint", "browseEndpoint"]))
        else {
            continue;
        };
        let browse_id = string_field(Some(endpoint), "browseId");
        let page_type = string_field(
            field(
                endpoint,
                &[
                    "browseEndpointContextSupportedConfigs",
                    "browseEndpointContextMusicConfig",
                ],
            ),
            "pageType",
        );
        if page_type == "MUSIC_PAGE_TYPE_TRACK_LYRICS" || browse_id.starts_with("MPLYt") {
            return browse_id;
        }
    }
    String::new()
}

pub fn parse_lyrics(payload: &Value) -> Result<Lyrics, String> {
    let shelf = find_nodes(payload, "musicDescriptionShelfRenderer")
        .into_iter()
        .next();
    let lines: Vec<String> = join_runs(shelf.and_then(|row| row.get("description")))
        .split('\n')
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect();
    if !lines.is_empty() {
        return Ok(Lyrics {
            source: join_runs(shelf.and_then(|row| row.get("footer"))),
            lines,
            message: String::new(),
            ..Lyrics::default()
        });
    }
    let message = parse_message(payload);
    Ok(Lyrics {
        message: if message.is_empty() {
            "Letra não disponível".into()
        } else {
            message
        },
        ..Lyrics::default()
    })
}

pub fn parse_queue(payload: &Value) -> Result<Vec<Track>, String> {
    let rows = find_nodes(payload, "playlistPanelVideoRenderer");
    let mut tracks = Vec::new();
    for row in rows {
        let video_id = string_field(Some(row), "videoId");
        if video_id.is_empty() {
            continue;
        }
        let (artist, album) = split_byline(&join_runs(row.get("longBylineText")));
        let (artist_browse_id, album_browse_id) = byline_catalog_ids(row.get("longBylineText"));
        tracks.push(Track {
            video_id,
            playlist_id: String::new(),
            title: join_runs(row.get("title")),
            artist,
            album,
            duration: join_runs(row.get("lengthText")),
            thumbnail: largest_thumbnail(row.get("thumbnail")),
            album_browse_id,
            artist_browse_id,
            ..Track::default()
        });
    }
    Ok(tracks)
}

/// A non-OK playability status is an error: ANDROID_VR refuses with
/// LOGIN_REQUIRED and WEB_REMIX answers a stale "reload the page" screen.
pub fn parse_stream(payload: &Value) -> Result<Stream, String> {
    parse_stream_with(payload, None)
}

/// `container` picks the preferred audio family when a track ships both:
/// `Some("webm")` flips the preference to Opus/WebM.
pub fn parse_stream_with(payload: &Value, container: Option<&str>) -> Result<Stream, String> {
    let player: PlayerPayload = serde_json::from_value(payload.clone())
        .map_err(|error| format!("player payload has an unexpected shape: {error}"))?;
    let video_id = player.video_details.video_id;

    if let Some(status) = player.playability_status.status {
        if status != "OK" {
            let reason = player
                .playability_status
                .reason
                .unwrap_or_else(|| "no reason given".to_string());
            return Err(format!("player \"{video_id}\" is {status}: {reason}"));
        }
    }

    let mut stream = Stream {
        video_id,
        title: player.video_details.title,
        author: player.video_details.author,
        duration: player
            .video_details
            .length_seconds
            .parse()
            .unwrap_or_default(),
        ..Stream::default()
    };
    // Progressive MP4 wins the fallback slot: a fragmented DASH segment cannot
    // be fed to a bare <audio> element.
    for format in &player.streaming_data.formats {
        if format.url.is_empty() || !format.mime_type.starts_with("video/mp4") {
            continue;
        }
        stream.fallback_url = format.url.clone();
        stream.fallback_mime = format.mime_type.clone();
        stream.fallback_itag = format.itag;
        break;
    }
    for format in player.streaming_data.adaptive_formats {
        if !format.mime_type.starts_with("audio/") || format.url.is_empty() {
            continue;
        }
        let candidate = (audio_rank(&format.mime_type, container), format.bitrate);
        if candidate <= (audio_rank(&stream.mime_type, container), stream.bitrate) {
            continue;
        }
        stream.audio_url = format.url;
        stream.mime_type = format.mime_type;
        stream.itag = format.itag;
        stream.bitrate = format.bitrate;
    }
    if stream.audio_url.is_empty() {
        if stream.fallback_url.is_empty() {
            return Err(format!(
                "player \"{}\" returned no audio format with a direct url",
                stream.video_id
            ));
        }
        // ANDROID often ships only progressive itag 18 (probed 2026-11-05).
        stream.audio_url = stream.fallback_url.clone();
        stream.mime_type = stream.fallback_mime.clone();
        stream.itag = stream.fallback_itag;
    }
    Ok(stream)
}

pub fn parse_suggestions(payload: &Value) -> Result<Vec<String>, String> {
    let rows = find_nodes(payload, "searchSuggestionRenderer");
    let suggestions = rows
        .iter()
        .map(|row| join_runs(row.get("suggestion")))
        .filter(|text| !text.is_empty())
        .collect();
    Ok(suggestions)
}

pub fn parse_guide(payload: &Value) -> Result<Vec<GuideEntry>, String> {
    let rows = find_nodes(payload, "guideEntryRenderer");
    let mut entries = Vec::new();
    for row in rows {
        let label = join_runs(row.get("formattedTitle"));
        let browse_id = string_field(
            field(row, &["navigationEndpoint", "browseEndpoint"]),
            "browseId",
        );
        if label.is_empty() || browse_id.is_empty() {
            continue;
        }
        entries.push(GuideEntry { label, browse_id });
    }
    Ok(entries)
}

pub fn parse_account(payload: &Value) -> Result<Account, String> {
    let rows = find_nodes(payload, "activeAccountHeaderRenderer");
    let Some(header) = rows.first() else {
        return Ok(Account::default());
    };
    Ok(Account {
        display_name: join_runs(header.get("accountName")),
        email: join_runs(header.get("email")),
        handle: join_runs(header.get("channelHandle")),
        photo_url: largest_thumbnail(header.get("accountPhoto")),
    })
}

fn account_from_gaia_row(row: &[Value]) -> Option<Account> {
    let display_name = row
        .get(2)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let email = row
        .get(3)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let photo = row
        .get(4)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if display_name.is_empty() && !email.contains('@') {
        return None;
    }
    Some(Account {
        display_name,
        email: if email.contains('@') {
            email
        } else {
            String::new()
        },
        handle: String::new(),
        photo_url: if photo.starts_with("https://") {
            photo.to_string()
        } else {
            String::new()
        },
    })
}

/// `POST accounts.google.com/ListAccounts` body. YTM `account_menu` has no
/// email field even when `logged_in=1` (probed 2026-11-06).
pub fn parse_list_account_rows(payload: &Value) -> Result<Vec<Account>, String> {
    let Some(rows) = payload.as_array() else {
        return Ok(Vec::new());
    };
    if rows.first().and_then(Value::as_str) != Some("gaia.l.a.r") {
        return Ok(Vec::new());
    }
    let Some(list) = rows.get(1).and_then(Value::as_array) else {
        return Ok(Vec::new());
    };
    Ok(list
        .iter()
        .filter_map(Value::as_array)
        .filter_map(|row| account_from_gaia_row(row))
        .collect())
}

pub fn parse_list_accounts(payload: &Value) -> Result<Account, String> {
    Ok(parse_list_account_rows(payload)?
        .into_iter()
        .next()
        .unwrap_or_default())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerPayload {
    #[serde(default)]
    playability_status: PlayabilityStatus,
    #[serde(default)]
    video_details: VideoDetails,
    #[serde(default)]
    streaming_data: StreamingData,
}

#[derive(Default, Deserialize)]
struct PlayabilityStatus {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    reason: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoDetails {
    #[serde(default)]
    video_id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    author: String,
    #[serde(default)]
    length_seconds: String,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamingData {
    #[serde(default)]
    adaptive_formats: Vec<Format>,
    #[serde(default)]
    formats: Vec<Format>,
}

#[derive(Deserialize)]
struct Format {
    #[serde(default)]
    itag: u32,
    #[serde(default, rename = "mimeType")]
    mime_type: String,
    #[serde(default)]
    bitrate: u64,
    #[serde(default)]
    url: String,
}

fn find_nodes<'a>(node: &'a Value, key: &str) -> Vec<&'a Value> {
    let mut found = Vec::new();
    collect_nodes(node, key, &mut found);
    found
}

fn collect_nodes<'a>(node: &'a Value, key: &str, found: &mut Vec<&'a Value>) {
    match node {
        Value::Object(map) => {
            for (field_name, value) in map {
                if field_name == key {
                    found.push(value);
                }
                collect_nodes(value, key, found);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_nodes(item, key, found);
            }
        }
        _ => {}
    }
}

fn field<'a>(node: &'a Value, path: &[&str]) -> Option<&'a Value> {
    path.iter().try_fold(node, |current, key| current.get(*key))
}

fn array_items(node: Option<&Value>) -> &[Value] {
    node.and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn string_field(node: Option<&Value>, key: &str) -> String {
    node.and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn first_browse_id(node: Option<&Value>) -> String {
    for run in array_items(node.and_then(|value| value.get("runs"))) {
        let browse_id = string_field(
            field(run, &["navigationEndpoint", "browseEndpoint"]),
            "browseId",
        );
        if !browse_id.is_empty() {
            return browse_id;
        }
    }
    String::new()
}

fn byline_catalog_ids(node: Option<&Value>) -> (String, String) {
    let mut artist = String::new();
    let mut album = String::new();
    for run in array_items(node.and_then(|value| value.get("runs"))) {
        let browse_id = string_field(
            field(run, &["navigationEndpoint", "browseEndpoint"]),
            "browseId",
        );
        if artist.is_empty() && browse_id.starts_with("UC") {
            artist = browse_id.clone();
        }
        if album.is_empty() && browse_id.starts_with("MPREb_") {
            album = browse_id;
        }
        if !artist.is_empty() && !album.is_empty() {
            break;
        }
    }
    (artist, album)
}

fn flex_catalog_ids(node: &Value) -> (String, String) {
    let mut artist = String::new();
    let mut album = String::new();
    for column in array_items(node.get("flexColumns")) {
        let (col_artist, col_album) = byline_catalog_ids(field(
            column,
            &["musicResponsiveListItemFlexColumnRenderer", "text"],
        ));
        if artist.is_empty() {
            artist = col_artist;
        }
        if album.is_empty() {
            album = col_album;
        }
        if !artist.is_empty() && !album.is_empty() {
            break;
        }
    }
    (artist, album)
}

fn watch_endpoint(node: Option<&Value>) -> Option<&Value> {
    let node = node?;
    field(node, &["playNavigationEndpoint", "watchEndpoint"])
        .or_else(|| {
            field(
                node,
                &["buttonRenderer", "navigationEndpoint", "watchEndpoint"],
            )
        })
        .or_else(|| field(node, &["navigationEndpoint", "watchEndpoint"]))
}

fn byline_fields(title: &str, texts: &[String]) -> (String, String) {
    let extras: Vec<&str> = texts
        .iter()
        .map(String::as_str)
        .filter(|text| {
            !text.is_empty() && !looks_like_duration(text) && !looks_like_play_count(text)
        })
        .collect();
    if extras.first() == Some(&title) && extras.len() >= 3 && !extras[1].contains('•') {
        return (extras[1].to_string(), extras[2].to_string());
    }
    let after_title: Vec<&str> = extras
        .iter()
        .copied()
        .filter(|text| *text != title)
        .collect();
    if after_title.len() >= 2 && !after_title[0].contains('•') {
        return (after_title[0].to_string(), after_title[1].to_string());
    }
    split_byline(after_title.first().copied().unwrap_or(""))
}

fn join_runs(node: Option<&Value>) -> String {
    let Some(node) = node else {
        return String::new();
    };
    if let Some(simple) = node.get("simpleText").and_then(Value::as_str) {
        return simple.trim().to_string();
    }
    let text: String = array_items(node.get("runs"))
        .iter()
        .filter_map(|run| run.get("text").and_then(Value::as_str))
        .collect();
    text.trim().to_string()
}

fn largest_thumbnail(node: Option<&Value>) -> String {
    array_items(node.and_then(|value| value.get("thumbnails")))
        .last()
        .and_then(|thumb| thumb.get("url"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn looks_like_play_count(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("tocou")
        || lower.contains("visualiza")
        || lower.contains("reprodu")
        || lower
            .split(|c: char| !c.is_ascii_alphabetic())
            .any(|word| matches!(word, "view" | "views" | "play" | "plays"))
}

fn responsive_column_texts(node: &Value) -> Vec<String> {
    let mut texts = Vec::new();
    for column in array_items(node.get("flexColumns")) {
        texts.push(join_runs(field(
            column,
            &["musicResponsiveListItemFlexColumnRenderer", "text"],
        )));
    }
    for column in array_items(node.get("fixedColumns")) {
        texts.push(join_runs(field(
            column,
            &["musicResponsiveListItemFixedColumnRenderer", "text"],
        )));
    }
    texts
}

fn responsive_track(node: &Value) -> Option<Track> {
    let mut video_id = string_field(node.get("playlistItemData"), "videoId");
    if video_id.is_empty() {
        video_id = overlay_video_id(node);
    }
    if video_id.is_empty() {
        return None;
    }

    let texts = responsive_column_texts(node);
    let title = texts.first().cloned().unwrap_or_default();
    if title.is_empty() {
        return None;
    }
    let (artist, album) = byline_fields(&title, &texts);
    let (artist_browse_id, album_browse_id) = flex_catalog_ids(node);
    Some(Track {
        video_id,
        playlist_id: overlay_playlist_id(node),
        browse_id: catalog_browse_id(node),
        album_browse_id,
        artist_browse_id,
        title,
        artist,
        album,
        duration: texts
            .iter()
            .find(|text| looks_like_duration(text))
            .cloned()
            .unwrap_or_default(),
        thumbnail: largest_thumbnail(field(
            node,
            &["thumbnail", "musicThumbnailRenderer", "thumbnail"],
        )),
        play_count: texts
            .iter()
            .find(|text| looks_like_play_count(text))
            .cloned()
            .unwrap_or_default(),
        ..Track::default()
    })
}

fn any_track(item: &Value) -> Option<Track> {
    if let Some(two_row) = item.get("musicTwoRowItemRenderer") {
        return two_row_track(two_row);
    }
    item.get("musicResponsiveListItemRenderer")
        .and_then(responsive_track)
}

fn two_row_track(node: &Value) -> Option<Track> {
    let mut video_id = string_field(
        field(node, &["navigationEndpoint", "watchEndpoint"]),
        "videoId",
    );
    if video_id.is_empty() {
        video_id = overlay_video_id(node);
    }
    let mut playlist_id = overlay_playlist_id(node);
    if playlist_id.is_empty() {
        playlist_id = playlist_from_browse(node);
    }
    let browse_id = catalog_browse_id(node);
    if video_id.is_empty() && playlist_id.is_empty() && browse_id.is_empty() {
        return None;
    }
    let (artist, album) = split_byline(&join_runs(node.get("subtitle")));
    let (artist_browse_id, byline_album_id) = byline_catalog_ids(node.get("subtitle"));
    let album_browse_id = if !byline_album_id.is_empty() {
        byline_album_id
    } else if browse_id.starts_with("MPREb_") {
        browse_id.clone()
    } else {
        String::new()
    };
    Some(Track {
        video_id,
        playlist_id,
        browse_id,
        album_browse_id,
        artist_browse_id,
        title: join_runs(node.get("title")),
        artist,
        album,
        duration: String::new(),
        thumbnail: largest_thumbnail(field(
            node,
            &["thumbnailRenderer", "musicThumbnailRenderer", "thumbnail"],
        )),
        play_count: String::new(),
        explicit: track_is_explicit(node),
        ..Track::default()
    })
}

fn track_is_explicit(node: &Value) -> bool {
    find_nodes(node, "musicInlineBadgeRenderer")
        .iter()
        .any(|badge| string_field(field(badge, &["icon"]), "iconType") == "MUSIC_EXPLICIT_BADGE")
}

/// Mix/album cards put the play target on `thumbnailOverlay`; search rows
/// still use `overlay` (probed 2026-11-05 on FEmusic_home).
fn play_navigation(node: &Value) -> Option<&Value> {
    for key in ["thumbnailOverlay", "overlay"] {
        let endpoint = field(
            node,
            &[
                key,
                "musicItemThumbnailOverlayRenderer",
                "content",
                "musicPlayButtonRenderer",
                "playNavigationEndpoint",
            ],
        );
        if endpoint.is_some() {
            return endpoint;
        }
    }
    None
}

fn overlay_video_id(node: &Value) -> String {
    string_field(
        play_navigation(node).and_then(|endpoint| endpoint.get("watchEndpoint")),
        "videoId",
    )
}

fn overlay_playlist_id(node: &Value) -> String {
    let play = play_navigation(node);
    let from_playlist = string_field(
        play.and_then(|endpoint| endpoint.get("watchPlaylistEndpoint")),
        "playlistId",
    );
    if !from_playlist.is_empty() {
        return from_playlist;
    }
    string_field(
        play.and_then(|endpoint| endpoint.get("watchEndpoint")),
        "playlistId",
    )
}

fn playlist_from_browse(node: &Value) -> String {
    let browse_id = string_field(
        field(node, &["navigationEndpoint", "browseEndpoint"]),
        "browseId",
    );
    browse_id
        .strip_prefix("VL")
        .filter(|id| !id.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn catalog_browse_id(node: &Value) -> String {
    let browse_id = string_field(
        field(node, &["navigationEndpoint", "browseEndpoint"]),
        "browseId",
    );
    if browse_id.is_empty() || browse_id.starts_with("VL") {
        String::new()
    } else {
        browse_id
    }
}

fn is_catalog_type(text: &str) -> bool {
    matches!(
        text.trim().to_lowercase().as_str(),
        "álbum" | "album" | "ep" | "single" | "playlist" | "mixtape"
    )
}

fn split_byline(byline: &str) -> (String, String) {
    let parts: Vec<&str> = byline
        .split('•')
        .map(str::trim)
        .filter(|part| {
            !part.is_empty() && !looks_like_play_count(part) && !looks_like_duration(part)
        })
        .collect();
    if parts.is_empty() {
        return (String::new(), String::new());
    }
    if is_catalog_type(parts[0]) {
        return (
            parts.get(1).unwrap_or(&"").to_string(),
            parts[0].to_string(),
        );
    }
    (
        parts[0].to_string(),
        parts.get(1).unwrap_or(&"").to_string(),
    )
}

fn looks_like_duration(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 8
        && text.contains(':')
        && text
            .chars()
            .all(|character| character == ':' || character.is_ascii_digit())
}

/// MP4/AAC beats Opus/WebM: Chromium and WebKit both answer
/// MEDIA_ELEMENT_ERROR (format error) for the googlevideo WebM stream.
fn audio_rank(mime_type: &str, preferred: Option<&str>) -> u8 {
    let is_mp4 = mime_type.starts_with("audio/mp4");
    match preferred {
        Some("webm") => u8::from(!is_mp4),
        _ => u8::from(is_mp4),
    }
}
