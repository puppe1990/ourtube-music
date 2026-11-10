# OurTube Music — regras pra agentes

App Tauri 2 que lê os endpoints internos do YouTube Music (Innertube) mapeados numa captura
decifrada em 05/11/2026. O Rust fala com a API; o JS só desenha e toca o áudio.

## Comandos

```bash
npm ci --include=dev     # o ambiente exporta NODE_ENV=production; sem a flag as devDeps somem
npm test                 # node --test + @faker-js/faker
npm run rust:test        # cargo test (fixtures com a crate `fake`)
npm run lint
npm run format:check
npm run ci               # format:check + lint + test
npm run dev              # preview no browser em http://127.0.0.1:8794 (proxy), não use 8765
npm run tauri:dev        # dist + janela Tauri (dev)
npm run bundle           # gera "OurTube Music.app" em src-tauri/target/release/bundle/macos
npm run install:app      # gera e copia o .app para /Applications
```

Gate completo: `npm run ci && npm run rust:test`.

Pre-commit: lint-staged + `npm test`. CI: `.github/workflows/ci.yml` (Node + Rust).
Release: tag `v*` dispara `.github/workflows/release.yml` (macOS / Windows / Linux).
Chaves Last.fm e sessão Google ficam em `<app_config_dir>/` (`lastfm.json`,
`credentials.json`) modo `0600` — nunca no git.

## Endpoints mapeados (fonte: captura decifrada)

| Comando Tauri          | Endpoint                                         | Cliente     |
| ---------------------- | ------------------------------------------------ | ----------- |
| `music_home`           | `POST /youtubei/v1/browse` (`FEmusic_home` + até 4 `{continuation}`) | WEB_REMIX   |
| `music_browse`         | `POST /youtubei/v1/browse` (Explorar/Biblioteca) | WEB_REMIX   |
| `music_search`         | `POST /youtubei/v1/search`                       | WEB_REMIX   |
| `music_queue`          | `POST /youtubei/v1/next`                         | WEB_REMIX   |
| `music_lyrics`         | `/next` → `MPLYt_*` then browse; LRCLib for cues | WEB_REMIX   |
| `music_stream`         | `POST /youtubei/v1/player`                       | **ANDROID** |
| `music_suggestions`    | `POST /youtubei/v1/music/get_search_suggestions` | WEB_REMIX   |
| `music_guide`          | `POST /youtubei/v1/guide`                        | WEB_REMIX   |
| `music_account`        | `POST /youtubei/v1/account/account_menu`         | WEB_REMIX   |
| `offline_list`         | `app_config_dir/offline/index.json`              | —           |
| `offline_save`         | ANDROID `/player` + write `offline/media/*.m4a`  | ANDROID     |
| `offline_remove`       | drop one file + index row                        | —           |
| `offline_remove_album` | drop every track with that `MPREb_`              | —           |

A home oficial só manda Lançamentos numa continuation. `music_home` segue até 4
páginas `{continuation}` (Rust e o preview). Mais aponta para
`FEmusic_new_releases_albums`. `music_browse` não segue continuation.

WEB_REMIX responde `UNPLAYABLE` no `/player`; o cliente ANDROID devolve URL
direta do `googlevideo.com` no itag 18 progressivo (`ftypmp42`, sondado em
05/11/2026). IOS só manda AAC DASH (`ftypdash`) que o WKWebView rejeita.
ANDROID_VR agora responde `LOGIN_REQUIRED`. Não troque isso sem testar o
`/player` de verdade.

## Player

- O `/player` tenta ANDROID e cai para IOS. O `<audio>` toca o MP4 progressivo
  itag 18 (muxed); o AAC adaptativo só entra se o muxed não vier.
- O proxy baixa a faixa inteira em janelas de 256/64/16 KB com pausa de 120 ms e
  backoff em 403 (o CDN limita rajadas e recusa spans > ~256 KB), guarda em
  memória por 15 min e serve `Range` local — o `<audio>` toca e busca normal.
  Faixas pinadas em Downloads ficam em `<app_config_dir>/offline/` (`index.json` +
  `media/{videoId}.m4a`, modo `0600`). O `/audio/{videoId}` serve o disco primeiro,
  depois o RAM, depois o CDN. Álbum baixa faixa a faixa (JS), sem rajada no CDN.
- googlevideo GET usa o UA do app Android e não manda Cookie (a captura oficial
  também não manda). 403 ainda pode aparecer em parte do catálogo.

## Login

- Device flow OAuth (`src-tauri/src/auth.rs`): `device/code` → código na tela →
  `token` com `grant_type=urn:ietf:params:oauth:grant-type:device_code`.
- Token em `<app_config_dir>/auth.json` `0600` (`src-tauri/src/session.rs`), com
  refresh 60 s antes de expirar; nunca Keychain (prompt a cada rebuild).
- Requisições autenticadas mandam `Authorization: Bearer` + `X-Goog-AuthUser: 0`.
- O diálogo tem botão de copiar o código e abre `google.com/device` no navegador
  do sistema via comando `open_external`, que só aceita https em `google.com`/
  `www.google.com` (guard testado em Rust e JS).

## Estrutura

| Caminho                                | Responsabilidade                                 |
| -------------------------------------- | ------------------------------------------------ |
| `src-tauri/src/innertube/endpoints.rs` | constantes das rotas/clientes                    |
| `src-tauri/src/innertube/models.rs`    | structs serde (camelCase pro JS)                 |
| `src-tauri/src/innertube/parsers.rs`   | JSON → modelo (funções puras, testadas)          |
| `src-tauri/src/innertube/client.rs`    | corpo da requisição + HTTP blocking              |
| `src-tauri/src/commands.rs`            | comandos Tauri (blocking pool)                   |
| `src-tauri/src/offline.rs`             | índice + arquivos muxed do cache pessoal         |
| `src/`                                 | domínio JS puro (format, queue, api, offline, …) |
| `web/`                                 | UI (index.html, app.js, style.css)               |
| `scripts/dev-proxy.mjs`                | preview no browser + proxy `/innertube/*`        |
| `test/`                                | `node:test` com faker                            |

## Design (Obsidian Pulse)

Veio do pacote Stitch (`stitch_red_spotify_music_player.zip`) e passou pelo unslop
(2026-11-06). `web/style.css` é a fonte única dos tokens: fundo `#030303`, superfícies
`#0f0f0f`/`#181818`/`#212121`, hairline `rgba(237,237,237,0.08)`, texto `#ededed` /
`#a1a1a6` / `#85858b`. Plus Jakarta Sans self-hosted em `web/fonts/` (400/500).
Carmesim `#ff0000` nos acentos pequenos: wordmark `Music`, marca, ícone da rail atual,
coração das curtidas, borda da conta, discos de play (capa/quick/álbum/dock) e faixa
tocando. Sem ponto pulando no Início. Capas carregam o resto da cor. Layout: rail 256px + canvas + dock 80px
(três módulos: faixa, controles/scrubber, volume). Home title `Início`. Não invente hex
novo: use as variáveis CSS.

## Convenções

- Funções 4–20 linhas; arquivos até 300 (teto 500). Nomes greppáveis.
- Comentário só de WHY/proveniência (ex.: por que ANDROID no player).
- Erros carregam o valor (`player "abc" is UNPLAYABLE: …`).
- Sem `any`/`unwrap()` em superfície pública: parsers devolvem `Result<T, String>`.
- Dados de teste vêm do faker (`@faker-js/faker` no JS, crate `fake` no Rust) — nada de literal
  quando um gerador resolve; seed fixo por arquivo.

## Testes

- `npm test` (JS) e `npm run rust:test` (Rust) — headless, sem rede.
- Bugfix ganha teste de regressão; `foo.rs` ↔ `tests/foo_test.rs`.

## Fronteiras

- Não commitar binários/target. Pedir antes de: force-push, reescrever `main`.
- Uso pessoal dos endpoints; não redistribuir mídia nem burlar paywall.
