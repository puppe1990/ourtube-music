export const COMMANDS = {
  home: 'music_home',
  search: 'music_search',
  queue: 'music_queue',
  stream: 'music_stream',
  suggestions: 'music_suggestions',
  guide: 'music_guide',
  account: 'music_account',
  audio: 'music_audio',
  authBrowserLogin: 'auth_browser_login',
  authCheck: 'auth_check',
  authState: 'auth_state',
  authLogout: 'auth_logout',
}

export function createMusicApi(invoke) {
  return {
    home: () => invoke(COMMANDS.home),
    search: (query) => invoke(COMMANDS.search, { query }),
    queue: (videoId) => invoke(COMMANDS.queue, { videoId }),
    stream: (videoId) => invoke(COMMANDS.stream, { videoId }),
    suggestions: (input) => invoke(COMMANDS.suggestions, { input }),
    guide: () => invoke(COMMANDS.guide),
    account: () => invoke(COMMANDS.account),
    audio: (videoId, container) =>
      invoke(COMMANDS.audio, container ? { videoId, container } : { videoId }),
    authBrowserLogin: () => invoke(COMMANDS.authBrowserLogin),
    authCheck: () => invoke(COMMANDS.authCheck),
    authState: () => invoke(COMMANDS.authState),
    authLogout: () => invoke(COMMANDS.authLogout),
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
      throw new Error(`dev proxy ${command} returned HTTP ${response.status}`)
    }
    return response.json()
  }
}
