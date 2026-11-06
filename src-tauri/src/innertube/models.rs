use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub video_id: String,
    #[serde(default)]
    pub playlist_id: String,
    #[serde(default)]
    pub browse_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: String,
    pub thumbnail: String,
    #[serde(default)]
    pub play_count: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeChip {
    pub label: String,
    pub params: String,
    pub browse_id: String,
    pub selected: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseHeader {
    pub title: String,
    pub artist: String,
    pub subtitle: String,
    pub second_subtitle: String,
    pub thumbnail: String,
    #[serde(default)]
    pub artist_thumbnail: String,
    #[serde(default)]
    pub playlist_id: String,
    #[serde(default)]
    pub video_id: String,
    #[serde(default)]
    pub artist_browse_id: String,
    #[serde(default)]
    pub page_type: String,
    #[serde(default)]
    pub mix_playlist_id: String,
    #[serde(default)]
    pub mix_video_id: String,
    #[serde(default)]
    pub subscriber_count: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFeed {
    pub chips: Vec<HomeChip>,
    pub shelves: Vec<Shelf>,
    #[serde(default)]
    pub continuation: String,
    #[serde(default)]
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<BrowseHeader>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub title: String,
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub layout: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stream {
    pub video_id: String,
    pub title: String,
    pub author: String,
    pub duration: u32,
    pub audio_url: String,
    pub mime_type: String,
    pub itag: u32,
    pub bitrate: u64,
    /// Progressive muxed MP4 (itag 18): plays in any webview when the
    /// fragmented adaptive stream is rejected.
    pub fallback_url: String,
    pub fallback_mime: String,
    pub fallback_itag: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuideEntry {
    pub label: String,
    pub browse_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricCue {
    pub text: String,
    pub start_ms: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub lines: Vec<String>,
    #[serde(default)]
    pub cues: Vec<LyricCue>,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub display_name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub handle: String,
    #[serde(default)]
    pub photo_url: String,
}
