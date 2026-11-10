function findNodes(node, key, found = []) {
  if (Array.isArray(node)) {
    for (const item of node) findNodes(item, key, found)
    return found
  }
  if (!node || typeof node !== 'object') return found
  for (const [fieldName, value] of Object.entries(node)) {
    if (fieldName === key) found.push(value)
    findNodes(value, key, found)
  }
  return found
}

function field(node, ...path) {
  return path.reduce((current, key) => (current == null ? undefined : current[key]), node)
}

function joinRuns(node) {
  if (!node) return ''
  if (typeof node.simpleText === 'string') return node.simpleText.trim()
  if (!Array.isArray(node.runs)) return ''
  return node.runs
    .map((run) => run?.text ?? '')
    .join('')
    .trim()
}

function largestThumbnail(node) {
  const thumbs = node?.thumbnails
  if (!Array.isArray(thumbs) || thumbs.length === 0) return ''
  return thumbs[thumbs.length - 1].url ?? ''
}

function looksLikeDuration(text) {
  return text.length > 0 && text.length <= 8 && text.includes(':') && /^[\d:]+$/.test(text)
}

function looksLikePlayCount(text) {
  return /(tocou|visualiza|\bviews?\b|\bplays?\b|reprodu)/i.test(String(text ?? ''))
}

function isCatalogType(text) {
  return /^(álbum|album|ep|single|playlist|mixtape)$/i.test(String(text ?? '').trim())
}

function isTypeLabel(text) {
  return /^(música|musica|song|vídeo|video|artista|artist|episódio|episodio|episode|perfil|profile|podcast)$/i.test(
    String(text ?? '').trim(),
  )
}

export function decodeSearchParams(value) {
  const raw = String(value ?? '')
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch (_error) {
    return raw
  }
}

export function searchHref(query, params = '') {
  const q = new URLSearchParams()
  if (query) q.set('q', query)
  if (params) q.set('params', params)
  return `#/search?${q.toString()}`
}

export function searchStateFromHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '')
  const [path, queryString] = raw.split('?')
  if (path !== '/search') return {}
  const q = new URLSearchParams(queryString ?? '')
  return { query: q.get('q') ?? '', params: q.get('params') ?? '' }
}

function playNavigation(node) {
  for (const key of ['thumbnailOverlay', 'overlay']) {
    const endpoint = field(
      node,
      key,
      'musicItemThumbnailOverlayRenderer',
      'content',
      'musicPlayButtonRenderer',
      'playNavigationEndpoint',
    )
    if (endpoint) return endpoint
  }
  return undefined
}

function overlayPlaylistId(node) {
  const play = playNavigation(node)
  return play?.watchPlaylistEndpoint?.playlistId || play?.watchEndpoint?.playlistId || ''
}

function catalogBrowseId(node) {
  const browseId = field(node, 'navigationEndpoint', 'browseEndpoint', 'browseId') ?? ''
  if (!browseId || browseId.startsWith('VL')) return ''
  return browseId
}

function columnTexts(node) {
  const flex = Array.isArray(node.flexColumns) ? node.flexColumns : []
  const fixed = Array.isArray(node.fixedColumns) ? node.fixedColumns : []
  return [
    ...flex.map((column) => columnText(column, 'musicResponsiveListItemFlexColumnRenderer')),
    ...fixed.map((column) => columnText(column, 'musicResponsiveListItemFixedColumnRenderer')),
  ]
}

function columnText(column, rendererKey) {
  return joinRuns(field(column, rendererKey, 'text'))
}

function splitSearchByline(byline) {
  const parts = String(byline ?? '')
    .split('•')
    .map((part) => part.trim())
    .filter((part) => part && !looksLikePlayCount(part) && !looksLikeDuration(part))
  if (parts.length === 0) return { artist: '', album: '' }
  if (isCatalogType(parts[0])) return { artist: parts[1] ?? '', album: parts[0] }
  if (isTypeLabel(parts[0])) return { artist: parts[1] ?? '', album: parts[2] ?? '' }
  return { artist: parts[0] ?? '', album: parts[1] ?? '' }
}

function bylineFromTexts(title, texts) {
  const extras = texts.filter(
    (text) => text && !looksLikeDuration(text) && !looksLikePlayCount(text) && text !== title,
  )
  return splitSearchByline(extras[0] ?? '')
}

const PAGE_TYPES = {
  MUSIC_PAGE_TYPE_ALBUM: 'album',
  MUSIC_PAGE_TYPE_ARTIST: 'artist',
  MUSIC_PAGE_TYPE_USER_CHANNEL: 'profile',
  MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_CHANNEL: 'profile',
  MUSIC_PAGE_TYPE_PLAYLIST: 'playlist',
  MUSIC_PAGE_TYPE_PODCAST_SHOW: 'podcast',
}

const VIDEO_TYPES = {
  MUSIC_VIDEO_TYPE_ATV: 'song',
  MUSIC_VIDEO_TYPE_OMV: 'video',
  MUSIC_VIDEO_TYPE_UGC: 'video',
  MUSIC_VIDEO_TYPE_PODCAST_EPISODE: 'episode',
}

const LABEL_TYPES = {
  álbum: 'album',
  album: 'album',
  ep: 'album',
  single: 'album',
  música: 'song',
  musica: 'song',
  song: 'song',
  artista: 'artist',
  artist: 'artist',
  vídeo: 'video',
  video: 'video',
  episódio: 'episode',
  episodio: 'episode',
  episode: 'episode',
  playlist: 'playlist',
  perfil: 'profile',
  profile: 'profile',
  podcast: 'podcast',
}

export function resultTypeFrom(pageType, videoType, subtitle) {
  if (PAGE_TYPES[pageType]) return PAGE_TYPES[pageType]
  if (VIDEO_TYPES[videoType]) return VIDEO_TYPES[videoType]
  const label = String(subtitle ?? '')
    .split('•')[0]
    .trim()
    .toLowerCase()
  return LABEL_TYPES[label] ?? ''
}

function browsePageType(node) {
  return (
    field(
      node,
      'browseEndpointContextSupportedConfigs',
      'browseEndpointContextMusicConfig',
      'pageType',
    ) ?? ''
  )
}

function watchVideoType(endpoint) {
  return (
    field(
      endpoint,
      'watchEndpoint',
      'watchEndpointMusicSupportedConfigs',
      'watchEndpointMusicConfig',
      'musicVideoType',
    ) ?? ''
  )
}

function emptyItem() {
  return {
    videoId: '',
    playlistId: '',
    browseId: '',
    albumBrowseId: '',
    artistBrowseId: '',
    title: '',
    artist: '',
    album: '',
    duration: '',
    thumbnail: '',
    playCount: '',
    subtitle: '',
    resultType: '',
  }
}

function bylineCatalogIds(node) {
  let artistBrowseId = ''
  let albumBrowseId = ''
  for (const run of node?.runs ?? []) {
    const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId ?? ''
    if (!artistBrowseId && browseId.startsWith('UC')) artistBrowseId = browseId
    if (!albumBrowseId && browseId.startsWith('MPREb_')) albumBrowseId = browseId
  }
  return { artistBrowseId, albumBrowseId }
}

function columnCatalogIds(node) {
  let artistBrowseId = ''
  let albumBrowseId = ''
  for (const column of node?.flexColumns ?? []) {
    const ids = bylineCatalogIds(column?.musicResponsiveListItemFlexColumnRenderer?.text)
    if (!artistBrowseId) artistBrowseId = ids.artistBrowseId
    if (!albumBrowseId) albumBrowseId = ids.albumBrowseId
  }
  return { artistBrowseId, albumBrowseId }
}

function searchItem(node) {
  let videoId = node?.playlistItemData?.videoId ?? ''
  const play = playNavigation(node)
  if (!videoId) videoId = play?.watchEndpoint?.videoId ?? ''
  const playlistId = overlayPlaylistId(node)
  const browseId = catalogBrowseId(node)
  if (!videoId && !playlistId && !browseId) return null
  const texts = columnTexts(node)
  const title = texts[0] ?? ''
  if (!title) return null
  const subtitle = texts.slice(1).filter(Boolean).join(' • ')
  const pageType = browsePageType(field(node, 'navigationEndpoint', 'browseEndpoint'))
  const resultType = resultTypeFrom(pageType, watchVideoType(play), subtitle)
  const named = resultType === 'artist' || resultType === 'profile'
  const { artist, album } = named ? { artist: '', album: '' } : bylineFromTexts(title, texts)
  const { artistBrowseId, albumBrowseId } = named
    ? { artistBrowseId: '', albumBrowseId: '' }
    : columnCatalogIds(node)
  return {
    ...emptyItem(),
    videoId,
    playlistId,
    browseId,
    albumBrowseId,
    artistBrowseId,
    title,
    artist,
    album,
    duration: texts.find(looksLikeDuration) ?? '',
    thumbnail: largestThumbnail(field(node, 'thumbnail', 'musicThumbnailRenderer', 'thumbnail')),
    playCount: texts.find(looksLikePlayCount) ?? '',
    subtitle,
    resultType,
  }
}

function buttonEndpoint(button) {
  const renderer = button?.buttonRenderer ?? {}
  return renderer.command ?? renderer.navigationEndpoint ?? {}
}

function parseTop(node) {
  if (!node) return null
  const title = joinRuns(node.title)
  if (!title) return null
  const subtitle = joinRuns(node.subtitle)
  const onTap = node.onTap ?? {}
  let videoId = ''
  let playlistId = ''
  let shufflePlaylistId = ''
  for (const button of node.buttons ?? []) {
    const endpoint = buttonEndpoint(button)
    const icon = button?.buttonRenderer?.icon?.iconType ?? ''
    const listId =
      endpoint.watchPlaylistEndpoint?.playlistId || endpoint.watchEndpoint?.playlistId || ''
    const watchId = endpoint.watchEndpoint?.videoId ?? ''
    if (icon === 'MUSIC_SHUFFLE') {
      shufflePlaylistId = listId
      if (!videoId) videoId = watchId
    } else {
      if (listId) playlistId = listId
      if (watchId) videoId = watchId
    }
  }
  if (!playlistId) playlistId = playNavigation(node)?.watchPlaylistEndpoint?.playlistId ?? ''
  return {
    title,
    subtitle,
    thumbnail: largestThumbnail(field(node, 'thumbnail', 'musicThumbnailRenderer', 'thumbnail')),
    browseId: onTap.browseEndpoint?.browseId ?? '',
    videoId,
    playlistId,
    shufflePlaylistId: shufflePlaylistId || playlistId,
    resultType: resultTypeFrom(browsePageType(onTap.browseEndpoint), '', subtitle),
  }
}

function tabRoot(payload) {
  return findNodes(payload, 'tabbedSearchResultsRenderer')[0]
}

function tabRenderers(root) {
  return (root?.tabs ?? []).map((item) => item.tabRenderer).filter(Boolean)
}

function parseTabs(root) {
  return tabRenderers(root)
    .map((tab) => {
      const endpoint = tab.endpoint ?? tab.navigationEndpoint
      return {
        label: tab.title ?? '',
        params: decodeSearchParams(endpoint?.searchEndpoint?.params ?? ''),
        selected: Boolean(tab.selected),
      }
    })
    .filter((tab) => tab.label)
}

function selectedTab(root) {
  const tabs = tabRenderers(root)
  return tabs.find((tab) => tab.selected) ?? tabs[0] ?? null
}

function parseSearchChips(tab) {
  return findNodes(tab ?? {}, 'chipCloudChipRenderer')
    .map((row) => ({
      label: joinRuns(row.text),
      params: decodeSearchParams(row.navigationEndpoint?.searchEndpoint?.params ?? ''),
      selected: Boolean(row.isSelected),
    }))
    .filter((chip) => chip.label)
}

export function parseSearchFeed(payload) {
  const root = tabRoot(payload)
  const selected = selectedTab(root) ?? payload
  const items = findNodes(selected, 'musicResponsiveListItemRenderer')
    .map(searchItem)
    .filter(Boolean)
  return {
    tabs: parseTabs(root),
    chips: parseSearchChips(selected),
    top: parseTop(findNodes(selected, 'musicCardShelfRenderer')[0]),
    items,
  }
}

export function searchPlayableTracks(feed) {
  const top = feed?.top
  const items = Array.isArray(feed?.items) ? feed.items : []
  if (!top) return items
  return [
    {
      ...emptyItem(),
      ...top,
    },
    ...items,
  ]
}
