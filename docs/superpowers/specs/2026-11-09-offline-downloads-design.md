# Offline downloads — design

Date: 2026-11-09
Status: approved (approach 1: disk files + existing audio proxy)

## Goal

Pin tracks and albums to disk so OurTube plays them without googlevideo. Manual download button, a **Downloads** rail item, album download saves every playable track on that album.

Personal cache only. Files stay on this Mac. The app does not redistribute media or skip a paywall.

## Non-goals

- Playlist download
- Artist “download all”
- Auto-cache / LRU of everything played
- Quality picker
- Licence expiry / periodic online check
- Parallel googlevideo fetches
- Sharing or exporting the `.m4a` files

## Architecture

Reuse the localhost audio proxy. It already downloads the whole track in 256/64/16 KiB windows. Offline persists those bytes.

```
app_config_dir/                          # ~/Library/Application Support/com.gestaobem.ourtube-music
  credentials.json
  lastfm.json
  offline/
    index.json                           # metadata, 0600
    media/{videoId}.m4a                  # ANDROID itag 18 muxed MP4
```

`src-tauri/src/offline.rs` owns the index and files (same role as `lastfm.rs`). JS never writes media. Preview (`scripts/dev-proxy.mjs`) uses `src/offlineNode.mjs` against the same directory so `#/downloads` matches the desktop app.

Playback: `GET /audio/{videoId}` checks disk first, then the 15-minute RAM cache, then googlevideo. Saved tracks always play from disk, online or off.

Album download is JS-orchestrated: resolve tracks (album page already loaded, or `music_browse`), then `offline_save` one track at a time (CDN 403s bursts).

## Data

`index.json`:

```json
{
  "tracks": [
    {
      "videoId": "xxxxxxxxxxx",
      "title": "",
      "artist": "",
      "album": "",
      "duration": "3:21",
      "thumbnail": "https://…",
      "browseId": "MPREb_…",
      "playlistId": "",
      "bytes": 4124416,
      "mimeType": "audio/mp4",
      "savedAt": 1731170000
    }
  ]
}
```

- `videoId` is the only key. Sanitize: 6–20 chars of `[A-Za-z0-9_-]`. Reject path separators.
- Writes are temp file + rename.
- `offline_save` is idempotent: already on disk returns the index row.
- Missing `index.json` is an empty library.

## Commands

| Command                | Args                     | Result                   |
| ---------------------- | ------------------------ | ------------------------ |
| `offline_list`         | —                        | `{ tracks, bytesTotal }` |
| `offline_save`         | track fields + `videoId` | `OfflineTrack`           |
| `offline_remove`       | `videoId`                | `{ removed: bool }`      |
| `offline_remove_album` | `browseId`               | `{ removed: string[] }`  |

`offline_save` calls `MusicClient::fetch_media(videoId, Some("muxed"))`, writes `media/{id}.m4a`, upserts the index. Stream title/author/duration fill blanks.

No Tauri events. Album progress is `setStatus('baixando 3/12…')` in the JS loop.

## UI

Portuguese copy. Obsidian Pulse tokens only.

**Rail** — `#downloads` under **Músicas curtidas**, glyph = arrow into tray (not crimson tile). Hash `#/downloads`. Current when that hash is open.

**Downloads page** — group by `browseId` when two or more saved tracks share an `MPREb_` id: cover, album title, artist, “N faixas”, play (queue = those tracks), remove album. Remaining tracks under **Faixas**. Empty: `Nada baixado. Toque no download numa faixa ou num álbum.`

**Download button** — sibling of the playable row (never nested `<button>`). 32px icon, `data-offline-save="{videoId}"`, aria `Baixar` / `Remover download`. Saved state: check, `data-saved="true"`. Click saved → remove that track.

Surfaces: shelf/track lists, album rows, artist top songs, search song rows, dock (next to heart), album hero **Baixar** (`data-offline-album="{browseId}"`).

Album button states vs the album’s playable `videoId`s:

| State   | Label            | Click                  |
| ------- | ---------------- | ---------------------- |
| none    | Baixar           | save each track        |
| partial | Baixar restante  | save missing           |
| all     | Remover download | `offline_remove_album` |

Artist pages and playlists have per-track buttons only. Search top card with `MPREb_` browseId gets the album button.

## Playback

`play()` resolves `api.audio(videoId)` even when `music_stream` fails, if the track is saved. Metadata then comes from the index. `<audio src>` stays the proxy URL.

Downloads page play uses the saved tracks as the queue.

## Errors

- Unplayable / 403: skip that track, status `não deu pra baixar “{title}”`, continue the album.
- Disk full / IO: surface the error, stop the album loop.
- Invalid `videoId`: command error includes the value and the expected shape.
- Offline with nothing saved: existing stream error.

## Tests

- Rust `src-tauri/tests/offline_test.rs` + `fake`: sanitize, empty index, put/get/remove, idempotent put, reject `..` and `/`, `read_media` bytes match, remove album by browseId.
- JS `test/offline.test.mjs`, `test/offlineView.test.mjs`, `test/offlineNode.test.mjs` with faker: grouping, button state, page HTML, node round-trip in a temp dir.
- `test/api.test.mjs` maps the four commands.
- `test/style.test.mjs` covers `.offline-btn` and `.downloads-page`.
- Gate: `npm run ci && npm run rust:test`. No live googlevideo in tests.

## Files

| Path                           | Role                                   |
| ------------------------------ | -------------------------------------- |
| `src-tauri/src/offline.rs`     | index + media files                    |
| `src-tauri/src/audio_proxy.rs` | disk before RAM/CDN                    |
| `src-tauri/src/commands.rs`    | four commands                          |
| `src-tauri/src/main.rs`        | manage `OfflineStore`, pass into proxy |
| `src/offline.mjs`              | grouping + button state                |
| `src/offlineView.mjs`          | Downloads HTML + save button HTML      |
| `src/offlineNode.mjs`          | preview disk IO                        |
| `scripts/dev-proxy.mjs`        | local commands + disk in `/audio`      |
| `web/index.html`               | `#downloads`, dock `#offline-current`  |
| `web/style.css`                | row + page + dock                      |
| `web/app.js`                   | route, save/remove, play fallback      |
| `README.md`                    | personal cache notice                  |
