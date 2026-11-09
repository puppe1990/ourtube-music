//! Personal offline cache: muxed AAC/MP4 next to credentials, keyed by videoId.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const OFFLINE_DIR: &str = "offline";
const INDEX_FILE: &str = "index.json";
const MEDIA_DIR: &str = "media";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineTrack {
    pub video_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub duration: String,
    #[serde(default)]
    pub thumbnail: String,
    #[serde(default)]
    pub browse_id: String,
    #[serde(default)]
    pub playlist_id: String,
    #[serde(default)]
    pub bytes: u64,
    #[serde(default)]
    pub mime_type: String,
    #[serde(default)]
    pub saved_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflineIndex {
    #[serde(default)]
    tracks: Vec<OfflineTrack>,
}

pub struct OfflineStore {
    dir: PathBuf,
    index: Mutex<OfflineIndex>,
}

impl OfflineStore {
    pub fn load(config_dir: PathBuf) -> Self {
        let dir = config_dir.join(OFFLINE_DIR);
        let _ = fs::create_dir_all(dir.join(MEDIA_DIR));
        let index = load_index(&dir).unwrap_or_default();
        Self {
            dir,
            index: Mutex::new(index),
        }
    }

    pub fn list(&self) -> Vec<OfflineTrack> {
        self.locked().tracks.clone()
    }

    pub fn bytes_total(&self) -> u64 {
        self.locked().tracks.iter().map(|track| track.bytes).sum()
    }

    pub fn has(&self, video_id: &str) -> bool {
        self.locked()
            .tracks
            .iter()
            .any(|track| track.video_id == video_id)
    }

    pub fn get(&self, video_id: &str) -> Option<OfflineTrack> {
        self.locked()
            .tracks
            .iter()
            .find(|track| track.video_id == video_id)
            .cloned()
    }

    pub fn put(&self, mut track: OfflineTrack, bytes: &[u8]) -> Result<OfflineTrack, String> {
        let video_id = sanitize_video_id(&track.video_id)?.to_string();
        track.video_id = video_id.clone();
        track.bytes = bytes.len() as u64;
        if track.mime_type.is_empty() {
            track.mime_type = "audio/mp4".to_string();
        }
        if track.saved_at == 0 {
            track.saved_at = now_secs();
        }
        write_bytes(&self.media_path(&video_id), bytes)?;
        {
            let mut index = self.locked();
            if let Some(existing) = index
                .tracks
                .iter_mut()
                .find(|item| item.video_id == video_id)
            {
                *existing = track.clone();
            } else {
                index.tracks.insert(0, track.clone());
            }
            save_index(&self.dir, &index)?;
        }
        Ok(track)
    }

    pub fn remove(&self, video_id: &str) -> Result<bool, String> {
        let video_id = sanitize_video_id(video_id)?;
        let existed = {
            let mut index = self.locked();
            let before = index.tracks.len();
            index.tracks.retain(|track| track.video_id != video_id);
            let changed = index.tracks.len() != before;
            if changed {
                save_index(&self.dir, &index)?;
            }
            changed
        };
        let path = self.media_path(video_id);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("remove {}: {error}", path.display()))?;
        }
        Ok(existed)
    }

    pub fn remove_album(&self, browse_id: &str) -> Result<Vec<String>, String> {
        let browse_id = browse_id.trim();
        if browse_id.is_empty() {
            return Err("browseId is empty, expected an MPREb_ album id".to_string());
        }
        let ids: Vec<String> = self
            .locked()
            .tracks
            .iter()
            .filter(|track| track.browse_id == browse_id)
            .map(|track| track.video_id.clone())
            .collect();
        for video_id in &ids {
            self.remove(video_id)?;
        }
        Ok(ids)
    }

    pub fn read_media(&self, video_id: &str) -> Option<(String, Vec<u8>)> {
        let video_id = sanitize_video_id(video_id).ok()?;
        let track = self.get(video_id)?;
        let bytes = fs::read(self.media_path(video_id)).ok()?;
        let mime = if track.mime_type.is_empty() {
            "audio/mp4".to_string()
        } else {
            track.mime_type
        };
        Some((mime, bytes))
    }

    pub fn media_path(&self, video_id: &str) -> PathBuf {
        self.dir.join(MEDIA_DIR).join(format!("{video_id}.m4a"))
    }

    fn locked(&self) -> std::sync::MutexGuard<'_, OfflineIndex> {
        self.index.lock().expect("offline lock")
    }
}

pub fn sanitize_video_id(video_id: &str) -> Result<&str, String> {
    let id = video_id.trim();
    let valid = (6..=20).contains(&id.len())
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-');
    if valid {
        Ok(id)
    } else {
        Err(format!(
            "videoId {id:?} is invalid, expected 6–20 chars of [A-Za-z0-9_-]"
        ))
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn index_path(dir: &Path) -> PathBuf {
    dir.join(INDEX_FILE)
}

fn load_index(dir: &Path) -> Result<OfflineIndex, String> {
    let path = index_path(dir);
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(OfflineIndex::default());
        }
        Err(error) => return Err(format!("read {}: {error}", path.display())),
    };
    serde_json::from_str(&raw).map_err(|error| format!("parse {}: {error}", path.display()))
}

fn save_index(dir: &Path, index: &OfflineIndex) -> Result<(), String> {
    fs::create_dir_all(dir.join(MEDIA_DIR))
        .map_err(|error| format!("create {}: {error}", dir.display()))?;
    let json = serde_json::to_string_pretty(index)
        .map_err(|error| format!("serialize offline index: {error}"))?;
    write_private(&index_path(dir), json.as_bytes())
}

fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create {}: {error}", parent.display()))?;
    }
    let tmp = path.with_extension("m4a.tmp");
    write_private(&tmp, bytes)?;
    fs::rename(&tmp, path).map_err(|error| format!("rename {}: {error}", path.display()))
}

fn write_private(path: &Path, contents: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|error| format!("write {}: {error}", path.display()))?;
        file.write_all(contents)
            .map_err(|error| format!("write {}: {error}", path.display()))
    }
    #[cfg(not(unix))]
    {
        fs::write(path, contents).map_err(|error| format!("write {}: {error}", path.display()))
    }
}
