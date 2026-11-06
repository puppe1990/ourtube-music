import { createHash } from 'node:crypto'

const BASE_URL = 'https://music.youtube.com'
const MUSIC_ORIGIN = 'https://music.youtube.com'

const ROUTES = {
  music_home: { endpoint: '/youtubei/v1/browse', params: { browseId: 'FEmusic_home' } },
  music_search: { endpoint: '/youtubei/v1/search', params: {} },
  music_queue: { endpoint: '/youtubei/v1/next', params: {} },
  music_stream: { endpoint: '/youtubei/v1/player', params: {} },
  music_suggestions: { endpoint: '/youtubei/v1/music/get_search_suggestions', params: {} },
  music_guide: { endpoint: '/youtubei/v1/guide', params: {} },
  music_browse: { endpoint: '/youtubei/v1/browse', params: {} },
  music_account: { endpoint: '/youtubei/v1/account/account_menu', params: {} },
}

export const WEB_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'

// ANDROID /player answers itag 18 (progressive ftypmp42) with a direct URL.
// IOS only ships DASH AAC that WKWebView rejects (probed 2026-11-05).
export const ANDROID_USER_AGENT = 'com.google.android.youtube/20.10.4 (Linux; U; Android 11) gzip'

const WEB_CONTEXT = {
  client: { clientName: 'WEB_REMIX', clientVersion: '1.20261104.00.00', hl: 'pt', gl: 'BR' },
}

const ANDROID_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '20.10.4',
    androidSdkVersion: 30,
    osName: 'Android',
    osVersion: '11',
    hl: 'pt',
    gl: 'BR',
  },
}

export function upstreamRequest(command, args = {}) {
  const route = ROUTES[command]
  if (!route) throw new Error(`unknown music command "${command}"`)
  const isPlayer = command === 'music_stream'
  const body = {
    context: isPlayer ? ANDROID_CONTEXT : WEB_CONTEXT,
    ...route.params,
    ...args,
  }
  if (isPlayer) {
    body.contentCheckOk = true
    body.racyCheckOk = true
  }
  return {
    url: `${BASE_URL}${route.endpoint}?prettyPrint=false`,
    endpoint: route.endpoint,
    body,
    userAgent: isPlayer ? ANDROID_USER_AGENT : WEB_USER_AGENT,
  }
}

export function signsWithSapisid(command) {
  return command !== 'music_stream'
}

export function innertubeSessionHeaders({ command, userAgent, cookies, sapisid, timestamp }) {
  const headers = { 'content-type': 'application/json', 'user-agent': userAgent }
  if (!cookies) return headers
  headers.cookie = cookies
  if (sapisid && signsWithSapisid(command)) {
    headers.authorization = sapisidHash(sapisid, timestamp)
    headers['x-goog-authuser'] = '0'
    headers.origin = MUSIC_ORIGIN
    headers.referer = `${MUSIC_ORIGIN}/`
  }
  return headers
}

function sapisidHash(sapisid, timestamp) {
  const digest = createHash('sha1').update(`${timestamp} ${sapisid} ${MUSIC_ORIGIN}`).digest('hex')
  return `SAPISIDHASH ${timestamp}_${digest}`
}
