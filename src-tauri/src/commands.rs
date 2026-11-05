use crate::audio_proxy::{audio_path, AudioProxy};
use crate::innertube::client::MusicClient;
use crate::innertube::models::{Account, GuideEntry, Shelf, Stream, Track};

/// The innertube calls are blocking (reqwest::blocking), so every command hands
/// the work to the blocking pool instead of stalling the IPC thread.
async fn on_blocking_pool<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("innertube task failed: {error}"))?
}

#[tauri::command]
pub async fn music_home() -> Result<Vec<Shelf>, String> {
    on_blocking_pool(|| MusicClient::new().home()).await
}

#[tauri::command]
pub async fn music_search(query: String) -> Result<Vec<Track>, String> {
    on_blocking_pool(move || MusicClient::new().search(&query)).await
}

#[tauri::command]
pub async fn music_queue(video_id: String) -> Result<Vec<Track>, String> {
    on_blocking_pool(move || MusicClient::new().queue(&video_id)).await
}

#[tauri::command]
pub async fn music_stream(video_id: String) -> Result<Stream, String> {
    on_blocking_pool(move || MusicClient::new().stream(&video_id)).await
}

#[tauri::command]
pub async fn music_suggestions(input: String) -> Result<Vec<String>, String> {
    on_blocking_pool(move || MusicClient::new().suggestions(&input)).await
}

#[tauri::command]
pub async fn music_guide() -> Result<Vec<GuideEntry>, String> {
    on_blocking_pool(|| MusicClient::new().guide()).await
}

#[tauri::command]
pub async fn music_account() -> Result<Account, String> {
    on_blocking_pool(|| MusicClient::new().account()).await
}

/// The webview points `<audio>` here; the localhost proxy resolves a fresh
/// googlevideo URL and forwards Range requests.
#[tauri::command]
pub async fn music_audio(proxy: tauri::State<'_, AudioProxy>, video_id: String, container: Option<String>) -> Result<String, String> {
    Ok(format!(
        "{}{}",
        proxy.base_url(),
        audio_path(&video_id, container.as_deref())
    ))
}
