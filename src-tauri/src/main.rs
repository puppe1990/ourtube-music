#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use ourtube_music::audio_proxy;
use ourtube_music::innertube::client::MusicClient;

fn main() {
    let proxy = audio_proxy::start(Arc::new(MusicClient::new()))
        .expect("falha ao iniciar o proxy de áudio local");

    tauri::Builder::default()
        .manage(proxy)
        .invoke_handler(tauri::generate_handler![
            ourtube_music::commands::music_home,
            ourtube_music::commands::music_search,
            ourtube_music::commands::music_queue,
            ourtube_music::commands::music_stream,
            ourtube_music::commands::music_suggestions,
            ourtube_music::commands::music_guide,
            ourtube_music::commands::music_account,
            ourtube_music::commands::music_audio
        ])
        .run(tauri::generate_context!())
        .expect("falha ao abrir a janela do OurTube Music");
}
