# OurTube Music

![OurTube Music — signed-in home](docs/home.jpg)

Desktop reader (Tauri 2) for the public YouTube Music catalog. It talks to the
same internal Innertube endpoints the website uses. The map comes from a
decrypted network capture with `SSLKEYLOGFILE` on 05/11/2026.

## What is mapped

| Call                | Endpoint                                                                   | Client    |
| ------------------- | -------------------------------------------------------------------------- | --------- |
| Home                | `POST /youtubei/v1/browse` (`FEmusic_home`)                                | WEB_REMIX |
| Explore / Library   | `POST /youtubei/v1/browse` (`FEmusic_explore` / `FEmusic_library_landing`) | WEB_REMIX |
| Search              | `POST /youtubei/v1/search`                                                 | WEB_REMIX |
| Queue / up next     | `POST /youtubei/v1/next`                                                   | WEB_REMIX |
| Audio stream        | `POST /youtubei/v1/player`                                                 | ANDROID   |
| Search suggestions  | `POST /youtubei/v1/music/get_search_suggestions`                           | WEB_REMIX |
| Sidebar navigation  | `POST /youtubei/v1/guide`                                                  | WEB_REMIX |
| Account             | `POST /youtubei/v1/account/account_menu`                                   | WEB_REMIX |

WEB_REMIX `/player` returns `UNPLAYABLE`; the ANDROID client returns a direct
`googlevideo.com` URL on progressive itag 18 (`Range` → `206 video/mp4`).
WKWebView rejects IOS AAC DASH (`ftypdash`) in a bare `<audio>` element.

## Login (Google device flow)

The app signs in with a Google account without capturing a cookie: it requests a
code from `https://oauth2.googleapis.com/device/code` (YouTube TV client, scope
`.../auth/youtube`), shows the code in a modal, and polls
`https://oauth2.googleapis.com/token` with `grant_type=...device_code` until you
authorize at `google.com/device`. The refresh token lives in
`<app-config-dir>/auth.json` with mode `0600`. Innertube calls then send
`Authorization: Bearer <token>` and `X-Goog-AuthUser: 0`, so home, library, and
the player already answer with your account.

## Design

UI follows **Obsidian Pulse**: absolute black (`#030303`), tonal surfaces, crimson
accent `#ff0000`, Plus Jakarta Sans, and a three-module player dock. The same CSS
variables morph into the light theme (`html[data-theme='light']`).

## Run

```bash
npm ci --include=dev
npm run tauri:dev        # desktop window
npm run dev              # browser preview (proxy at http://127.0.0.1:8794)
```

Quality gate:

```bash
npm run ci && npm run rust:test
```

## TDD

- Rust: `src-tauri/tests/*.rs` — fixtures from the `fake` crate, pure parsers.
- JS: `test/*.test.mjs` — `node:test` + `@faker-js/faker` (format, queue, bridge, upstream).

## Notice

Personal use. The app does not download media, skip ads, or bypass a paywall; it
plays what the web player plays. Follow the service terms.
