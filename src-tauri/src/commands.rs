use std::sync::Arc;

use serde::Serialize;

use crate::audio_proxy::{audio_path, AudioProxy};
use crate::auth::{self, DeviceStart, PollOutcome};
use crate::innertube::client::MusicClient;
use crate::innertube::models::{Account, GuideEntry, Shelf, Stream, Track};
use crate::session::AuthSession;

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

fn authenticated(session: &AuthSession) -> Result<MusicClient, String> {
    Ok(MusicClient::new().with_token(session.access_token()?))
}

#[tauri::command]
pub async fn music_home(session: tauri::State<'_, Arc<AuthSession>>) -> Result<Vec<Shelf>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session)?.home()).await
}

#[tauri::command]
pub async fn music_search(
    session: tauri::State<'_, Arc<AuthSession>>,
    query: String,
) -> Result<Vec<Track>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session)?.search(&query)).await
}

#[tauri::command]
pub async fn music_queue(
    session: tauri::State<'_, Arc<AuthSession>>,
    video_id: String,
) -> Result<Vec<Track>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session)?.queue(&video_id)).await
}

#[tauri::command]
pub async fn music_stream(
    session: tauri::State<'_, Arc<AuthSession>>,
    video_id: String,
) -> Result<Stream, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session)?.stream(&video_id)).await
}

#[tauri::command]
pub async fn music_suggestions(
    session: tauri::State<'_, Arc<AuthSession>>,
    input: String,
) -> Result<Vec<String>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session)?.suggestions(&input)).await
}

#[tauri::command]
pub async fn music_guide(
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<Vec<GuideEntry>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session)?.guide()).await
}

#[tauri::command]
pub async fn music_account(
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<Account, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session)?.account()).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountState {
    pub logged_in: bool,
    pub display_name: String,
}

#[tauri::command]
pub async fn auth_start() -> Result<DeviceStart, String> {
    let start = on_blocking_pool(auth::start_device_flow).await?;
    println!("auth start: code={} expires={}s", start.user_code, start.expires_in);
    Ok(start)
}

/// Returns `pending`, `slow_down` or `authorized`; the UI polls every
/// `interval` seconds until authorized or expired.
#[tauri::command]
pub async fn auth_poll(
    session: tauri::State<'_, Arc<AuthSession>>,
    device_code: String,
) -> Result<String, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || match auth::poll_device_flow(&device_code)? {
        // Unauthorized yet: Google answers authorization_pending on every poll.

        PollOutcome::Pending => Ok("pending".to_string()),
        PollOutcome::SlowDown => Ok("slow_down".to_string()),
        PollOutcome::Token(tokens) => {
            session.store(tokens)?;
            Ok("authorized".to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn auth_state(
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<AccountState, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || {
        let client = authenticated(&session)?;
        let logged_in = session.tokens().is_some();
        let display_name = if logged_in {
            client.account().map(|account| account.display_name).unwrap_or_default()
        } else {
            String::new()
        };
        Ok(AccountState {
            logged_in,
            display_name,
        })
    })
    .await
}

#[tauri::command]
pub async fn auth_logout(session: tauri::State<'_, Arc<AuthSession>>) -> Result<(), String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || session.clear()).await
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
