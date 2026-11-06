// Mirror of src-tauri/src/innertube/parsers.rs so the browser preview (`npm run
// dev`) returns the same shapes the Tauri commands return.

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

function isCatalogType(text) {
  return /^(álbum|album|ep|single|playlist|mixtape)$/i.test(String(text ?? '').trim())
}

function splitByline(byline) {
  const parts = String(byline ?? '')
    .split('•')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return { artist: '', album: '' }
  if (isCatalogType(parts[0])) return { artist: parts[1] ?? '', album: parts[0] }
  return { artist: parts[0] ?? '', album: parts[1] ?? '' }
}

function looksLikeDuration(text) {
  return text.length > 0 && text.length <= 8 && text.includes(':') && /^[\d:]+$/.test(text)
}

// MP4/AAC beats Opus/WebM: Chromium and WebKit reject the googlevideo WebM
// stream with MEDIA_ELEMENT_ERROR (format error).
function audioScore(format, container) {
  const isMp4 = format.mimeType?.startsWith('audio/mp4')
  const preferred = container === 'webm' ? !isMp4 : isMp4
  return (preferred ? 1_000_000 : 0) + (format.bitrate ?? 0)
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

function playlistFromBrowse(node) {
  const browseId = field(node, 'navigationEndpoint', 'browseEndpoint', 'browseId') ?? ''
  return browseId.startsWith('VL') ? browseId.slice(2) : ''
}

function catalogBrowseId(node) {
  const browseId = field(node, 'navigationEndpoint', 'browseEndpoint', 'browseId') ?? ''
  if (!browseId || browseId.startsWith('VL')) return ''
  return browseId
}

function overlayPlaylistId(node) {
  const play = playNavigation(node)
  return play?.watchPlaylistEndpoint?.playlistId || play?.watchEndpoint?.playlistId || ''
}

function looksLikePlayCount(text) {
  return /tocou/i.test(String(text ?? ''))
}

function columnText(column, rendererKey) {
  return joinRuns(field(column, rendererKey, 'text'))
}

function emptyTrack() {
  return {
    videoId: '',
    playlistId: '',
    browseId: '',
    title: '',
    artist: '',
    album: '',
    duration: '',
    thumbnail: '',
    playCount: '',
  }
}

function responsiveTrack(node) {
  let videoId = node?.playlistItemData?.videoId ?? ''
  if (!videoId) videoId = playNavigation(node)?.watchEndpoint?.videoId ?? ''
  if (!videoId) return null

  const columns = Array.isArray(node.flexColumns) ? node.flexColumns : []
  const title = columnText(columns[0], 'musicResponsiveListItemFlexColumnRenderer')
  if (!title) return null

  const texts = [
    ...columns.map((column) => columnText(column, 'musicResponsiveListItemFlexColumnRenderer')),
    ...(Array.isArray(node.fixedColumns) ? node.fixedColumns : []).map((column) =>
      columnText(column, 'musicResponsiveListItemFixedColumnRenderer'),
    ),
  ]
  const byline = texts.find(
    (text) => text && text !== title && !looksLikeDuration(text) && !looksLikePlayCount(text),
  )
  const { artist, album } = splitByline(byline ?? '')

  return {
    ...emptyTrack(),
    videoId,
    playlistId: overlayPlaylistId(node),
    browseId: catalogBrowseId(node),
    title,
    artist,
    album,
    duration: texts.find(looksLikeDuration) ?? '',
    thumbnail: largestThumbnail(field(node, 'thumbnail', 'musicThumbnailRenderer', 'thumbnail')),
    playCount: texts.find(looksLikePlayCount) ?? '',
  }
}

function twoRowTrack(node) {
  let videoId = field(node, 'navigationEndpoint', 'watchEndpoint', 'videoId') ?? ''
  if (!videoId) videoId = playNavigation(node)?.watchEndpoint?.videoId ?? ''
  let playlistId = overlayPlaylistId(node)
  if (!playlistId) playlistId = playlistFromBrowse(node)
  const browseId = catalogBrowseId(node)
  if (!videoId && !playlistId && !browseId) return null
  const { artist, album } = splitByline(joinRuns(node.subtitle))
  return {
    ...emptyTrack(),
    videoId,
    playlistId,
    browseId,
    title: joinRuns(node.title),
    artist,
    album,
    thumbnail: largestThumbnail(
      field(node, 'thumbnailRenderer', 'musicThumbnailRenderer', 'thumbnail'),
    ),
  }
}

function anyTrack(renderers) {
  if (renderers?.musicTwoRowItemRenderer) return twoRowTrack(renderers.musicTwoRowItemRenderer)
  if (renderers?.musicResponsiveListItemRenderer) {
    return responsiveTrack(renderers.musicResponsiveListItemRenderer)
  }
  return null
}

export function parseSearchResults(payload) {
  return findNodes(payload, 'musicResponsiveListItemRenderer').map(responsiveTrack).filter(Boolean)
}

function tracksFromContents(contents) {
  return (contents ?? []).map(anyTrack).filter(Boolean)
}

function parseFeedMessage(payload) {
  const [row] = findNodes(payload, 'messageRenderer')
  if (!row) return ''
  return joinRuns(field(row, 'subtext', 'messageSubtextRenderer', 'text')) || joinRuns(row.text)
}

function parseCarouselShelves(payload) {
  return findNodes(payload, 'musicCarouselShelfRenderer').map((carousel) => ({
    title: joinRuns(field(carousel, 'header', 'musicCarouselShelfBasicHeaderRenderer', 'title')),
    tracks: tracksFromContents(carousel.contents),
  }))
}

function parseListShelves(payload) {
  return findNodes(payload, 'musicShelfRenderer').map((shelf) => ({
    title: joinRuns(shelf.title),
    tracks: tracksFromContents(shelf.contents),
  }))
}

export function parseHomeShelves(payload, options = {}) {
  const carousels = parseCarouselShelves(payload)
  const lists = parseListShelves(payload)
  const ordered = options.listsFirst ? [...lists, ...carousels] : [...carousels, ...lists]
  return ordered.filter((shelf) => shelf.tracks.length > 0)
}

function headerPlayEndpoint(node) {
  const [button] = findNodes(node, 'musicPlayButtonRenderer')
  return field(button, 'playNavigationEndpoint', 'watchEndpoint') ?? {}
}

function parseBrowseHeader(payload) {
  const [node] = findNodes(payload, 'musicResponsiveHeaderRenderer')
  if (!node) return null
  const title = joinRuns(node.title)
  if (!title) return null
  const play = headerPlayEndpoint(node)
  return {
    title,
    artist: joinRuns(node.straplineTextOne),
    subtitle: joinRuns(node.subtitle),
    secondSubtitle: joinRuns(node.secondSubtitle),
    thumbnail: largestThumbnail(field(node, 'thumbnail', 'musicThumbnailRenderer', 'thumbnail')),
    artistThumbnail: largestThumbnail(
      field(node, 'straplineThumbnail', 'musicThumbnailRenderer', 'thumbnail'),
    ),
    playlistId: play.playlistId ?? '',
    videoId: play.videoId ?? '',
  }
}

function enrichAlbumTracks(header, shelves) {
  if (!header) return shelves
  return shelves.map((shelf) => ({
    ...shelf,
    tracks: shelf.tracks.map((track) => ({
      ...track,
      artist: track.artist || header.artist,
      album: track.album || header.title,
      thumbnail: track.thumbnail || header.thumbnail,
      playlistId: track.playlistId || header.playlistId,
    })),
  }))
}

export function parseHomeFeed(payload) {
  const chips = findNodes(payload, 'chipCloudChipRenderer')
    .map((row) => ({
      label: joinRuns(row.text),
      params: field(row, 'navigationEndpoint', 'browseEndpoint', 'params') ?? '',
      browseId: field(row, 'navigationEndpoint', 'browseEndpoint', 'browseId') ?? '',
      selected: Boolean(row.isSelected),
    }))
    .filter((chip) => chip.label)
  const continuation = findNodes(payload, 'nextContinuationData')[0]?.continuation ?? ''
  const header = parseBrowseHeader(payload)
  return {
    chips,
    header,
    shelves: enrichAlbumTracks(header, parseHomeShelves(payload, { listsFirst: Boolean(header) })),
    continuation,
    message: parseFeedMessage(payload),
  }
}

export function parseQueue(payload) {
  return findNodes(payload, 'playlistPanelVideoRenderer')
    .filter((row) => row.videoId)
    .map((row) => ({
      videoId: row.videoId,
      playlistId: '',
      title: joinRuns(row.title),
      artist: joinRuns(row.longBylineText),
      album: '',
      duration: joinRuns(row.lengthText),
      thumbnail: largestThumbnail(row.thumbnail),
    }))
}

export function parseStream(payload, variant) {
  const container = variant === 'webm' ? 'webm' : 'mp4'
  const status = payload?.playabilityStatus?.status
  const videoId = payload?.videoDetails?.videoId ?? ''
  if (status && status !== 'OK') {
    const reason = payload?.playabilityStatus?.reason ?? 'no reason given'
    throw new Error(`player "${videoId}" is ${status}: ${reason}`)
  }

  const formats = (payload?.streamingData?.adaptiveFormats ?? []).filter(
    (format) => format.mimeType?.startsWith('audio/') && format.url,
  )
  // Progressive MP4 (itag 18) is what a bare <audio> can always decode.
  const muxed = (payload?.streamingData?.formats ?? []).find(
    (format) => format.url && format.mimeType?.startsWith('video/mp4'),
  )
  if (formats.length === 0 && !muxed?.url) {
    throw new Error(`player "${videoId}" returned no audio format with a direct url`)
  }
  const best = formats.length
    ? formats.reduce((winner, format) =>
        audioScore(format, container) > audioScore(winner, container) ? format : winner,
      )
    : muxed
  const chosen = variant === 'muxed' && muxed?.url ? muxed : best

  return {
    videoId,
    title: payload?.videoDetails?.title ?? '',
    author: payload?.videoDetails?.author ?? '',
    duration: Number(payload?.videoDetails?.lengthSeconds ?? 0),
    audioUrl: chosen.url,
    mimeType: chosen.mimeType,
    itag: chosen.itag,
    bitrate: chosen.bitrate ?? 0,
    fallbackUrl: muxed?.url ?? '',
    fallbackMime: muxed?.mimeType ?? '',
    fallbackItag: muxed?.itag ?? 0,
  }
}

export function parseSuggestions(payload) {
  return findNodes(payload, 'searchSuggestionRenderer')
    .map((row) => joinRuns(row.suggestion))
    .filter(Boolean)
}

export function parseGuide(payload) {
  return findNodes(payload, 'guideEntryRenderer')
    .map((row) => ({
      label: joinRuns(row.formattedTitle),
      browseId: field(row, 'navigationEndpoint', 'browseEndpoint', 'browseId') ?? '',
    }))
    .filter((entry) => entry.label && entry.browseId)
}

function emptyAccount() {
  return { displayName: '', email: '', handle: '', photoUrl: '' }
}

export function parseAccount(payload) {
  const [header] = findNodes(payload, 'activeAccountHeaderRenderer')
  if (!header) return emptyAccount()
  return {
    displayName: joinRuns(header.accountName),
    email: joinRuns(header.email),
    handle: joinRuns(header.channelHandle),
    photoUrl: largestThumbnail(header.accountPhoto),
  }
}

function listAccountRow(row) {
  if (!Array.isArray(row)) return null
  const displayName = typeof row[2] === 'string' ? row[2].trim() : ''
  const email = typeof row[3] === 'string' && row[3].includes('@') ? row[3].trim() : ''
  const photo = typeof row[4] === 'string' ? row[4].trim() : ''
  if (!displayName && !email) return null
  return {
    displayName,
    email,
    handle: '',
    photoUrl: photo.startsWith('https://') ? photo : '',
  }
}

// accounts.google.com/ListAccounts — YTM account_menu has no email (probed 2026-11-06).
export function parseListAccountRows(payload) {
  const rows = Array.isArray(payload) && payload[0] === 'gaia.l.a.r' ? payload[1] : null
  if (!Array.isArray(rows)) return []
  return rows.map(listAccountRow).filter(Boolean)
}

export function parseListAccounts(payload) {
  return parseListAccountRows(payload)[0] ?? emptyAccount()
}

const PARSERS = {
  music_home: parseHomeFeed,
  music_browse: parseHomeFeed,
  music_search: parseSearchResults,
  music_queue: parseQueue,
  music_stream: parseStream,
  music_suggestions: parseSuggestions,
  music_guide: parseGuide,
  music_account: parseAccount,
}

export function parseCommand(command, payload, options = {}) {
  const parser = PARSERS[command]
  if (!parser) throw new Error(`unknown music command "${command}"`)
  if (command === 'music_stream') return parser(payload, options.variant)
  return parser(payload)
}
