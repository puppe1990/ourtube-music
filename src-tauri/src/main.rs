#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use tauri::Manager;

use ourtube_music::audio_proxy;
use ourtube_music::lastfm::LastFmSession;
use ourtube_music::offline::OfflineStore;
use ourtube_music::session::AuthSession;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            println!("auth dir: {}", dir.display());
            let session = Arc::new(AuthSession::load(dir.clone()));
            let lastfm = Arc::new(LastFmSession::load(dir.clone()));
            let offline = Arc::new(OfflineStore::load(dir));
            let proxy = audio_proxy::start(Arc::clone(&session), Arc::clone(&offline))?;
            app.manage(session);
            app.manage(lastfm);
            app.manage(offline);
            app.manage(proxy);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ourtube_music::commands::music_home,
            ourtube_music::commands::music_search,
            ourtube_music::commands::music_queue,
            ourtube_music::commands::music_lyrics,
            ourtube_music::commands::music_stream,
            ourtube_music::commands::music_suggestions,
            ourtube_music::commands::music_browse,
            ourtube_music::commands::music_guide,
            ourtube_music::commands::music_account,
            ourtube_music::commands::music_audio,
            ourtube_music::commands::offline_list,
            ourtube_music::commands::offline_save,
            ourtube_music::commands::offline_remove,
            ourtube_music::commands::offline_remove_album,
            ourtube_music::commands::auth_browser_login,
            ourtube_music::commands::auth_check,
            ourtube_music::commands::auth_refresh,
            ourtube_music::commands::auth_state,
            ourtube_music::commands::auth_logout,
            ourtube_music::lastfm::lastfm_state,
            ourtube_music::lastfm::lastfm_login,
            ourtube_music::lastfm::lastfm_complete,
            ourtube_music::lastfm::lastfm_logout,
            ourtube_music::lastfm::lastfm_now_playing,
            ourtube_music::lastfm::lastfm_scrobble
        ])
        .run(tauri::generate_context!())
        .expect("falha ao abrir a janela do OurTube Music");
}
