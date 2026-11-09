use fake::faker::lorem::en::Word;
use fake::faker::name::en::Name;
use fake::Fake;
use ourtube_music::offline::{sanitize_video_id, OfflineStore, OfflineTrack};
use std::path::PathBuf;

fn video_id() -> String {
    let word: String = Word().fake();
    format!("{word:_<11}").chars().take(11).collect()
}

fn temp_dir() -> PathBuf {
    let unique: String = Word().fake();
    let dir = std::env::temp_dir().join(format!("ourtube-offline-{unique}"));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp offline dir");
    dir
}

fn track_meta(video_id: &str) -> OfflineTrack {
    OfflineTrack {
        video_id: video_id.to_string(),
        title: Name().fake(),
        artist: Name().fake(),
        album: Word().fake(),
        duration: "3:21".to_string(),
        thumbnail: format!("https://img/{}", Word().fake::<String>()),
        browse_id: format!("MPREb_{}", Word().fake::<String>()),
        playlist_id: String::new(),
        bytes: 0,
        mime_type: "audio/mp4".to_string(),
        saved_at: 0,
    }
}

#[test]
fn sanitize_video_id_accepts_youtube_ids_and_rejects_paths() {
    let id = video_id();
    assert_eq!(sanitize_video_id(&id).unwrap(), id.as_str());
    assert!(sanitize_video_id("..").is_err());
    assert!(sanitize_video_id("ab/cd").is_err());
    assert!(sanitize_video_id("").is_err());
    let err = sanitize_video_id("../etc").unwrap_err();
    assert!(err.contains("../etc"));
}

#[test]
fn empty_store_lists_nothing() {
    let dir = temp_dir();
    let store = OfflineStore::load(dir.clone());
    assert!(store.list().is_empty());
    assert_eq!(store.bytes_total(), 0);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn put_writes_media_and_index_and_is_idempotent() {
    let dir = temp_dir();
    let store = OfflineStore::load(dir.clone());
    let id = video_id();
    let bytes = Word().fake::<String>().into_bytes();
    let saved = store.put(track_meta(&id), &bytes).expect("put");

    assert_eq!(saved.video_id, id);
    assert_eq!(saved.bytes, bytes.len() as u64);
    assert!(saved.saved_at > 0);
    assert_eq!(store.read_media(&id).unwrap().1, bytes);
    assert!(store.has(&id));

    let again = store.put(track_meta(&id), &bytes).expect("put again");
    assert_eq!(again.video_id, id);
    assert_eq!(store.list().len(), 1);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn remove_drops_the_file_and_index_row() {
    let dir = temp_dir();
    let store = OfflineStore::load(dir.clone());
    let id = video_id();
    let bytes = Word().fake::<String>().into_bytes();
    store.put(track_meta(&id), &bytes).expect("put");

    assert!(store.remove(&id).expect("remove"));
    assert!(!store.has(&id));
    assert!(store.read_media(&id).is_none());
    assert!(!store.remove(&id).expect("remove missing"));

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn remove_album_deletes_every_track_with_that_browse_id() {
    let dir = temp_dir();
    let store = OfflineStore::load(dir.clone());
    let browse: String = format!("MPREb_{}", Word().fake::<String>());
    let keep_id = video_id();
    let first = video_id();
    let second = video_id();
    let payload = Word().fake::<String>().into_bytes();

    let mut a = track_meta(&first);
    a.browse_id = browse.clone();
    let mut b = track_meta(&second);
    b.browse_id = browse.clone();
    let mut extra = track_meta(&keep_id);
    extra.browse_id = format!("MPREb_{}", Word().fake::<String>());

    store.put(a, &payload).unwrap();
    store.put(b, &payload).unwrap();
    store.put(extra, &payload).unwrap();

    let removed = store.remove_album(&browse).expect("remove album");
    assert_eq!(removed.len(), 2);
    assert!(store.has(&keep_id));
    assert!(!store.has(&first));
    assert!(!store.has(&second));

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn load_picks_up_an_index_written_on_disk() {
    let dir = temp_dir();
    let first = OfflineStore::load(dir.clone());
    let id = video_id();
    let bytes = Word().fake::<String>().into_bytes();
    first.put(track_meta(&id), &bytes).unwrap();

    let second = OfflineStore::load(dir.clone());
    assert!(second.has(&id));
    assert_eq!(second.read_media(&id).unwrap().1, bytes);

    let _ = std::fs::remove_dir_all(&dir);
}
