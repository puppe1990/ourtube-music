use serde::Deserialize;
use serde_json::Value;

use crate::innertube::models::{Account, GuideEntry, Shelf, Stream, Track};

pub fn parse_search_results(payload: &Value) -> Result<Vec<Track>, String> {
    let rows = find_nodes(payload, "musicResponsiveListItemRenderer");
    let tracks = rows.iter().filter_map(|row| responsive_track(row)).collect();
    Ok(tracks)
}

pub fn parse_home_shelves(payload: &Value) -> Result<Vec<Shelf>, String> {
    let carousels = find_nodes(payload, "musicCarouselShelfRenderer");
    let mut shelves = Vec::new();
    for carousel in carousels {
        let title = join_runs(field(carousel, &["header", "musicCarouselShelfBasicHeaderRenderer", "title"]));
        let tracks: Vec<Track> = array_items(carousel.get("contents"))
            .iter()
            .filter_map(|item| any_track(item))
            .collect();
        if tracks.is_empty() {
            continue;
        }
        shelves.push(Shelf { title, tracks });
    }
    Ok(shelves)
}

pub fn parse_queue(payload: &Value) -> Result<Vec<Track>, String> {
    let rows = find_nodes(payload, "playlistPanelVideoRenderer");
    let mut tracks = Vec::new();
    for row in rows {
        let video_id = string_field(Some(row), "videoId");
        if video_id.is_empty() {
            continue;
        }
        tracks.push(Track {
            video_id,
            title: join_runs(row.get("title")),
            artist: join_runs(row.get("longBylineText")),
            album: String::new(),
            duration: join_runs(row.get("lengthText")),
            thumbnail: largest_thumbnail(row.get("thumbnail")),
        });
    }
    Ok(tracks)
}

/// A non-OK playability status is an error: IOS refuses with LOGIN_REQUIRED and
/// WEB_REMIX answers a stale "reload the page" screen.
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
            let reason = player.playability_status.reason.unwrap_or_else(|| "no reason given".to_string());
            return Err(format!("player \"{video_id}\" is {status}: {reason}"));
        }
    }

    let mut stream = Stream {
        video_id,
        title: player.video_details.title,
        author: player.video_details.author,
        duration: player.video_details.length_seconds.parse().unwrap_or_default(),
        ..Stream::default()
    };
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
        return Err(format!(
            "player \"{}\" returned no audio format with a direct url",
            stream.video_id
        ));
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
    let display_name = rows
        .first()
        .map(|row| join_runs(row.get("accountName")))
        .unwrap_or_default();
    Ok(Account { display_name })
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
    node.and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default()
}

fn string_field(node: Option<&Value>, key: &str) -> String {
    node.and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
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

fn responsive_track(node: &Value) -> Option<Track> {
    let mut video_id = string_field(node.get("playlistItemData"), "videoId");
    if video_id.is_empty() {
        video_id = overlay_video_id(node);
    }
    if video_id.is_empty() {
        return None;
    }

    let columns = array_items(node.get("flexColumns"));
    let mut track = Track {
        video_id,
        thumbnail: largest_thumbnail(field(
            node,
            &["thumbnail", "musicThumbnailRenderer", "thumbnail"],
        )),
        ..Track::default()
    };
    if let Some(first) = columns.first() {
        track.title = join_runs(field(first, &["musicResponsiveListItemFlexColumnRenderer", "text"]));
    }
    if let Some(second) = columns.get(1) {
        let byline = join_runs(field(second, &["musicResponsiveListItemFlexColumnRenderer", "text"]));
        (track.artist, track.album) = split_byline(&byline);
    }
    for column in columns {
        let text = join_runs(field(column, &["musicResponsiveListItemFlexColumnRenderer", "text"]));
        if looks_like_duration(&text) {
            track.duration = text;
        }
    }
    if track.title.is_empty() {
        return None;
    }
    Some(track)
}

fn any_track(item: &Value) -> Option<Track> {
    if let Some(two_row) = item.get("musicTwoRowItemRenderer") {
        return two_row_track(two_row);
    }
    item.get("musicResponsiveListItemRenderer").and_then(responsive_track)
}

fn two_row_track(node: &Value) -> Option<Track> {
    let video_id = string_field(field(node, &["navigationEndpoint", "watchEndpoint"]), "videoId");
    if video_id.is_empty() {
        return None;
    }
    let (artist, album) = split_byline(&join_runs(node.get("subtitle")));
    Some(Track {
        video_id,
        title: join_runs(node.get("title")),
        artist,
        album,
        duration: String::new(),
        thumbnail: largest_thumbnail(field(
            node,
            &["thumbnailRenderer", "musicThumbnailRenderer", "thumbnail"],
        )),
    })
}

/// Rows from albums and artists carry the watch target in the play overlay
/// instead of `playlistItemData`.
fn overlay_video_id(node: &Value) -> String {
    let overlay = field(
        node,
        &[
            "overlay",
            "musicItemThumbnailOverlayRenderer",
            "content",
            "musicPlayButtonRenderer",
            "playNavigationEndpoint",
            "watchEndpoint",
        ],
    );
    string_field(overlay, "videoId")
}

fn split_byline(byline: &str) -> (String, String) {
    let mut parts = byline.split('•');
    let artist = parts.next().unwrap_or_default().trim().to_string();
    let album = parts.next().unwrap_or_default().trim().to_string();
    (artist, album)
}

fn looks_like_duration(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 8
        && text.contains(':')
        && text.chars().all(|character| character == ':' || character.is_ascii_digit())
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
