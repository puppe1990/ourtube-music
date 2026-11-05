# OurTube Music — regras pra agentes

App Tauri 2 que lê os endpoints internos do YouTube Music (Innertube) mapeados numa captura
decifrada em 05/11/2026. O Rust fala com a API; o JS só desenha e toca o áudio.

## Comandos

```bash
npm ci --include=dev     # o ambiente exporta NODE_ENV=production; sem a flag as devDeps somem
npm test                 # node --test + @faker-js/faker (16 testes)
npm run rust:test        # cargo test (19 testes, fixtures com a crate `fake`)
npm run lint
npm run format:check
npm run ci               # format:check + lint + test
npm run dev              # preview no browser em http://127.0.0.1:8794 (proxy), não use 8765
npm run tauri:dev        # dist + janela Tauri
```

Gate completo: `npm run ci && npm run rust:test`.

Pre-commit: lint-staged + `npm test`. CI: `.github/workflows/ci.yml` (Node + Rust).

## Endpoints mapeados (fonte: captura decifrada)

| Comando Tauri       | Endpoint                                         | Cliente   |
| ------------------- | ------------------------------------------------ | --------- |
| `music_home`        | `POST /youtubei/v1/browse` (`FEmusic_home`)      | WEB_REMIX |
| `music_search`      | `POST /youtubei/v1/search`                       | WEB_REMIX |
| `music_queue`       | `POST /youtubei/v1/next`                         | WEB_REMIX |
| `music_stream`      | `POST /youtubei/v1/player`                       | **IOS**   |
| `music_suggestions` | `POST /youtubei/v1/music/get_search_suggestions` | WEB_REMIX |
| `music_guide`       | `POST /youtubei/v1/guide`                        | WEB_REMIX |
| `music_account`     | `POST /youtubei/v1/account/account_menu`         | WEB_REMIX |

WEB_REMIX responde `UNPLAYABLE` no `/player`; o cliente IOS devolve URL direta do
`googlevideo.com` (sondado em 05/11/2026). Não troque isso sem testar o `/player` de verdade.

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

| Caminho                                | Responsabilidade                                  |
| -------------------------------------- | ------------------------------------------------- |
| `src-tauri/src/innertube/endpoints.rs` | constantes das rotas/clientes                     |
| `src-tauri/src/innertube/models.rs`    | structs serde (camelCase pro JS)                  |
| `src-tauri/src/innertube/parsers.rs`   | JSON → modelo (funções puras, testadas)           |
| `src-tauri/src/innertube/client.rs`    | corpo da requisição + HTTP blocking               |
| `src-tauri/src/commands.rs`            | comandos Tauri (blocking pool)                    |
| `src/`                                 | domínio JS puro (format, queue, api, devUpstream) |
| `web/`                                 | UI (index.html, app.js, style.css)                |
| `scripts/dev-proxy.mjs`                | preview no browser + proxy `/innertube/*`         |
| `test/`                                | `node:test` com faker                             |

## Design (Obsidian Pulse)

Veio do pacote Stitch (`stitch_red_spotify_music_player.zip`). `web/style.css` é a fonte única
dos tokens: fundo `#030303`, superfícies `#0f0f0f`/`#181818`/`#212121`, borda `#2a2a2a`,
acento `#ff0000` (hover `#ff4e45`, press `#cc0000`), texto `#fff`/`#aaa`/`#717171`,
Plus Jakarta Sans. Layout: rail 256px + canvas + dock fixo de 80px (três módulos: faixa,
controles/scrubber, volume). Não invente hex novo: use as variáveis CSS.

## Convenções

- Funções 4–20 linhas; arquivos até 300 (teto 500). Nomes greppáveis.
- Comentário só de WHY/proveniência (ex.: por que IOS no player).
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
