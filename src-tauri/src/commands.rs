use std::sync::Arc;

use serde::Serialize;

use crate::audio_proxy::{audio_path, AudioProxy};
use crate::auth;
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

fn authenticated(session: &AuthSession) -> MusicClient {
    MusicClient::new().with_cookies(session.credentials())
}

#[tauri::command]
pub async fn music_home(session: tauri::State<'_, Arc<AuthSession>>) -> Result<Vec<Shelf>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).home()).await
}

#[tauri::command]
pub async fn music_search(
    session: tauri::State<'_, Arc<AuthSession>>,
    query: String,
) -> Result<Vec<Track>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).search(&query)).await
}

#[tauri::command]
pub async fn music_queue(
    session: tauri::State<'_, Arc<AuthSession>>,
    video_id: String,
) -> Result<Vec<Track>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).queue(&video_id)).await
}

#[tauri::command]
pub async fn music_stream(
    session: tauri::State<'_, Arc<AuthSession>>,
    video_id: String,
) -> Result<Stream, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).stream(&video_id)).await
}

#[tauri::command]
pub async fn music_suggestions(
    session: tauri::State<'_, Arc<AuthSession>>,
    input: String,
) -> Result<Vec<String>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).suggestions(&input)).await
}

#[tauri::command]
pub async fn music_guide(
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<Vec<GuideEntry>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).guide()).await
}

#[tauri::command]
pub async fn music_account(
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<Account, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).account()).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountState {
    pub logged_in: bool,
    pub display_name: String,
}

/// Opens the Google device page in the system browser. Only https Google
/// hosts are allowed: the webview must never hand an arbitrary URL to `open`.
const LOGIN_WINDOW: &str = "google-login";
const LOGIN_URL: &str =
    "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F";

/// Opens the real Google sign-in inside the app. The window shares the
/// webview cookie store, so `auth_check` can read `SAPISID` once the user
/// finishes — no password ever touches our code.
#[tauri::command]
pub async fn auth_browser_login(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = window.set_focus();
        return Ok(());
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let url = tauri::Url::parse(LOGIN_URL).expect("login url is valid");
        let built = tauri::WebviewWindowBuilder::new(
            &handle,
            LOGIN_WINDOW,
            tauri::WebviewUrl::External(url),
        )
        .title("Entrar com Google")
        .inner_size(520.0, 740.0)
        .build();
        let _ = sender.send(
            built
                .map(|_| ())
                .map_err(|error| format!("open login window: {error}")),
        );
    })
    .map_err(|error| format!("schedule login window: {error}"))?;
    receiver
        .recv()
        .map_err(|error| format!("login window channel: {error}"))?
}

/// Reads the login window cookies; `authorized` means SAPISID landed and the
/// credentials were persisted.
#[tauri::command]
pub async fn auth_check(
    app: tauri::AppHandle,
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<String, String> {
    use tauri::Manager;
    let Some(window) = app.get_webview_window(LOGIN_WINDOW) else {
        return Ok(if session.credentials().is_some() {
            "authorized".to_string()
        } else {
            "no_window".to_string()
        });
    };
    let cookies = window
        .cookies()
        .map_err(|error| format!("read login cookies: {error}"))?;
    let pairs: Vec<(String, String)> = cookies
        .iter()
        .map(|cookie| (cookie.name().to_string(), cookie.value().to_string()))
        .collect();
    println!(
        "auth check: {} cookies, has SAPISID={}",
        pairs.len(),
        pairs.iter().any(|(name, _)| name == "SAPISID" || name == "__Secure-3PAPISID")
    );
    match auth::extract_cookie_auth(&pairs) {
        Some(credentials) => {
            session.store(credentials)?;
            let _ = window.close();
            Ok("authorized".to_string())
        }
        None => Ok("pending".to_string()),
    }
}

#[tauri::command]
pub async fn auth_state(
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<AccountState, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || {
        let client = authenticated(&session);
        let logged_in = session.credentials().is_some();
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
