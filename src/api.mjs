export const COMMANDS = {
  home: 'music_home',
  search: 'music_search',
  queue: 'music_queue',
  stream: 'music_stream',
  suggestions: 'music_suggestions',
  guide: 'music_guide',
  browse: 'music_browse',
  account: 'music_account',
  audio: 'music_audio',
  authBrowserLogin: 'auth_browser_login',
  authCheck: 'auth_check',
  authRefresh: 'auth_refresh',
  authState: 'auth_state',
  authLogout: 'auth_logout',
  lastfmState: 'lastfm_state',
  lastfmLogin: 'lastfm_login',
  lastfmComplete: 'lastfm_complete',
  lastfmLogout: 'lastfm_logout',
  lastfmNowPlaying: 'lastfm_now_playing',
  lastfmScrobble: 'lastfm_scrobble',
  lyrics: 'music_lyrics',
}

export function createMusicApi(invoke) {
  return {
    home: (args = {}) => invoke(COMMANDS.home, args),
    search: (query, params) => invoke(COMMANDS.search, params ? { query, params } : { query }),
    queue: (videoId, playlistId) =>
      invoke(COMMANDS.queue, playlistId ? { videoId, playlistId } : { videoId }),
    stream: (videoId) => invoke(COMMANDS.stream, { videoId }),
    suggestions: (input) => invoke(COMMANDS.suggestions, { input }),
    guide: () => invoke(COMMANDS.guide),
    browse: (browseId) => invoke(COMMANDS.browse, { browseId }),
    account: () => invoke(COMMANDS.account),
    audio: (videoId, variant) =>
      invoke(COMMANDS.audio, variant ? { videoId, variant } : { videoId }),
    authBrowserLogin: () => invoke(COMMANDS.authBrowserLogin),
    authCheck: () => invoke(COMMANDS.authCheck),
    authRefresh: () => invoke(COMMANDS.authRefresh),
    authState: () => invoke(COMMANDS.authState),
    authLogout: () => invoke(COMMANDS.authLogout),
    lastfmState: () => invoke(COMMANDS.lastfmState),
    lastfmLogin: () => invoke(COMMANDS.lastfmLogin),
    lastfmComplete: () => invoke(COMMANDS.lastfmComplete),
    lastfmLogout: () => invoke(COMMANDS.lastfmLogout),
    lastfmNowPlaying: (payload) => invoke(COMMANDS.lastfmNowPlaying, payload),
    lastfmScrobble: (payload) => invoke(COMMANDS.lastfmScrobble, payload),
    lyrics: (videoId, extra = {}) => invoke(COMMANDS.lyrics, { videoId, ...extra }),
  }
}

export function resolveInvoker(scope = globalThis) {
  const invoke = scope.__TAURI__?.core?.invoke
  if (typeof invoke === 'function') return invoke
  return proxyInvoker(scope)
}

// Browser preview (`npm run dev`) has no Tauri IPC: the dev proxy answers the
// same command names so the UI runs without the desktop shell.
function proxyInvoker(scope) {
  return async (command, args = {}) => {
    const response = await scope.fetch(`/innertube/${command}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!response.ok) {
      const detail = await response.text()
      const plain = response.headers.get('content-type')?.includes('text/plain')
      throw new Error(
        plain && detail ? detail : `dev proxy ${command} returned HTTP ${response.status}`,
      )
    }
    return response.json()
  }
}
