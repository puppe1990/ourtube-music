const BASE_URL = 'https://music.youtube.com'

const ROUTES = {
  music_home: { endpoint: '/youtubei/v1/browse', params: { browseId: 'FEmusic_home' } },
  music_search: { endpoint: '/youtubei/v1/search', params: {} },
  music_queue: { endpoint: '/youtubei/v1/next', params: {} },
  music_stream: { endpoint: '/youtubei/v1/player', params: {} },
  music_suggestions: { endpoint: '/youtubei/v1/music/get_search_suggestions', params: {} },
  music_guide: { endpoint: '/youtubei/v1/guide', params: {} },
  music_account: { endpoint: '/youtubei/v1/account/account_menu', params: {} },
}

const WEB_CONTEXT = {
  client: { clientName: 'WEB_REMIX', clientVersion: '1.20261104.00.00', hl: 'en', gl: 'US' },
}

const IOS_CONTEXT = {
  client: {
    clientName: 'IOS',
    clientVersion: '20.10.4',
    deviceModel: 'iPhone16,2',
    osName: 'iPhone',
    osVersion: '18.3.2.22D82',
    hl: 'en',
    gl: 'US',
  },
}

export function upstreamRequest(command, args = {}) {
  const route = ROUTES[command]
  if (!route) throw new Error(`unknown music command "${command}"`)
  const isPlayer = command === 'music_stream'
  const body = {
    context: isPlayer ? IOS_CONTEXT : WEB_CONTEXT,
    ...route.params,
    ...args,
  }
  if (isPlayer) {
    body.contentCheckOk = true
    body.racyCheckOk = true
  }
  return { url: `${BASE_URL}${route.endpoint}?prettyPrint=false`, endpoint: route.endpoint, body }
}
