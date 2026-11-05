use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: String,
    pub thumbnail: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub title: String,
    pub tracks: Vec<Track>,
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
pub struct Account {
    pub display_name: String,
}
