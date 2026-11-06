use std::sync::Arc;

use serde::Serialize;

use crate::audio_proxy::{audio_path, AudioProxy};
use crate::auth;
use crate::innertube::client::MusicClient;
use crate::innertube::models::{Account, GuideEntry, HomeFeed, Lyrics, Stream, Track};
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

fn bound_credentials(session: &AuthSession) -> Option<auth::CookieAuth> {
    let credentials = session.credentials()?;
    if auth::session_is_youtube_bound(&credentials) {
        return Some(credentials);
    }
    match auth::bind_youtube_session(&credentials) {
        Ok(bound) => {
            let _ = session.store(bound.clone());
            Some(bound)
        }
        Err(_) => Some(credentials),
    }
}

fn authenticated(session: &AuthSession) -> MusicClient {
    MusicClient::new().with_cookies(bound_credentials(session))
}

#[tauri::command]
pub async fn music_home(
    session: tauri::State<'_, Arc<AuthSession>>,
    params: Option<String>,
) -> Result<HomeFeed, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).home(params.as_deref())).await
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
    video_id: Option<String>,
    playlist_id: Option<String>,
) -> Result<Vec<Track>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || {
        authenticated(&session).queue(
            &video_id.unwrap_or_default(),
            &playlist_id.unwrap_or_default(),
        )
    })
    .await
}

#[tauri::command]
pub async fn music_lyrics(
    session: tauri::State<'_, Arc<AuthSession>>,
    video_id: String,
    title: Option<String>,
    artist: Option<String>,
    duration_sec: Option<f64>,
) -> Result<Lyrics, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || {
        authenticated(&session).lyrics(
            &video_id,
            title.as_deref().unwrap_or(""),
            artist.as_deref().unwrap_or(""),
            duration_sec.unwrap_or(0.0),
        )
    })
    .await
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
pub async fn music_browse(
    session: tauri::State<'_, Arc<AuthSession>>,
    browse_id: String,
) -> Result<HomeFeed, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).browse_page(&browse_id)).await
}

#[tauri::command]
pub async fn music_guide(
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<Vec<GuideEntry>, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).guide()).await
}

#[tauri::command]
pub async fn music_account(session: tauri::State<'_, Arc<AuthSession>>) -> Result<Account, String> {
    let session = Arc::clone(session.inner());
    on_blocking_pool(move || authenticated(&session).account()).await
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountState {
    pub logged_in: bool,
    pub display_name: String,
    pub email: String,
    pub handle: String,
    pub photo_url: String,
    pub accounts: Vec<Account>,
}

/// Opens the Google device page in the system browser. Only https Google
/// hosts are allowed: the webview must never hand an arbitrary URL to `open`.
const LOGIN_WINDOW: &str = "google-login";
const LOGIN_URL: &str = auth::YOUTUBE_CONTINUE_URL;

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

/// Reads the shared cookie store (the webview keeps the Google session even
/// after the login window closes) and persists what the API needs.
fn collect_cookies(app: &tauri::AppHandle, session: &AuthSession) -> Result<String, String> {
    use tauri::Manager;
    let Some(window) = app
        .get_webview_window(LOGIN_WINDOW)
        .or_else(|| app.get_webview_window("main"))
    else {
        return Ok("no_window".to_string());
    };
    let cookies = window
        .cookies()
        .map_err(|error| format!("read cookies: {error}"))?;
    let pairs: Vec<(String, String)> = cookies
        .iter()
        .map(|cookie| (cookie.name().to_string(), cookie.value().to_string()))
        .collect();
    println!(
        "auth cookies: {} names={:?}",
        pairs.len(),
        pairs
            .iter()
            .map(|(name, _)| name.as_str())
            .take(24)
            .collect::<Vec<_>>()
    );
    match auth::extract_cookie_auth(&pairs) {
        Some(mut credentials) => {
            if let Some(previous) = session.credentials() {
                if credentials.email.is_empty() {
                    credentials.email = previous.email;
                }
                if credentials.display_name.is_empty() {
                    credentials.display_name = previous.display_name;
                }
                if credentials.identity_cookies.is_empty() {
                    credentials.identity_cookies = previous.identity_cookies;
                }
            }
            session.store(credentials)?;
            Ok("authorized".to_string())
        }
        None => Ok("pending".to_string()),
    }
}

#[tauri::command]
pub async fn auth_refresh(
    app: tauri::AppHandle,
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<String, String> {
    let session = Arc::clone(session.inner());
    collect_cookies(&app, &session)
}

#[tauri::command]
pub async fn auth_check(
    app: tauri::AppHandle,
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<String, String> {
    use tauri::Manager;
    if app.get_webview_window(LOGIN_WINDOW).is_none() {
        return Ok(if session.credentials().is_some() {
            "authorized".to_string()
        } else {
            "no_window".to_string()
        });
    }
    let session = Arc::clone(session.inner());
    let result = collect_cookies(&app, &session)?;
    if result == "authorized" {
        if let Some(window) = app.get_webview_window(LOGIN_WINDOW) {
            let _ = window.close();
        }
    }
    Ok(result)
}

fn first_nonempty(values: &[&str]) -> String {
    values
        .iter()
        .find(|value| !value.is_empty())
        .map(|value| (*value).to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn auth_state(
    app: tauri::AppHandle,
    session: tauri::State<'_, Arc<AuthSession>>,
) -> Result<AccountState, String> {
    let session = Arc::clone(session.inner());
    let _ = collect_cookies(&app, &session);
    on_blocking_pool(move || {
        let Some(stored) = session.credentials() else {
            return Ok(AccountState::default());
        };
        let client = authenticated(&session);
        let accounts = client.listed_accounts().unwrap_or_default();
        let listed = accounts.first().cloned().unwrap_or_default();
        let menu = client.account().unwrap_or_default();
        let display_name = first_nonempty(&[
            &listed.display_name,
            &stored.display_name,
            &menu.display_name,
        ]);
        let email = first_nonempty(&[&listed.email, &stored.email, &menu.email]);
        let handle = first_nonempty(&[&menu.handle, &listed.handle]);
        let photo_url = first_nonempty(&[&listed.photo_url, &menu.photo_url]);
        if email != stored.email || display_name != stored.display_name {
            let mut next = stored.clone();
            next.email = email.clone();
            next.display_name = display_name.clone();
            session.store(next)?;
        }
        Ok(AccountState {
            logged_in: true,
            display_name,
            email,
            handle,
            photo_url,
            accounts,
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
pub async fn music_audio(
    proxy: tauri::State<'_, AudioProxy>,
    video_id: String,
    variant: Option<String>,
) -> Result<String, String> {
    Ok(format!(
        "{}{}",
        proxy.base_url(),
        audio_path(&video_id, variant.as_deref())
    ))
}
