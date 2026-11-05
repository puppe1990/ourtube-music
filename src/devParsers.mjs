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

function splitByline(byline) {
  const [artist = '', album = ''] = byline.split('•').map((part) => part.trim())
  return { artist, album }
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

function responsiveTrack(node) {
  let videoId = node?.playlistItemData?.videoId ?? ''
  if (!videoId) {
    videoId =
      field(
        node,
        'overlay',
        'musicItemThumbnailOverlayRenderer',
        'content',
        'musicPlayButtonRenderer',
        'playNavigationEndpoint',
        'watchEndpoint',
        'videoId',
      ) ?? ''
  }
  if (!videoId) return null

  const columns = Array.isArray(node.flexColumns) ? node.flexColumns : []
  const title = joinRuns(field(columns[0], 'musicResponsiveListItemFlexColumnRenderer', 'text'))
  if (!title) return null
  const { artist, album } = splitByline(
    joinRuns(field(columns[1], 'musicResponsiveListItemFlexColumnRenderer', 'text')),
  )
  const duration = columns
    .map((column) => joinRuns(field(column, 'musicResponsiveListItemFlexColumnRenderer', 'text')))
    .find(looksLikeDuration)

  return {
    videoId,
    title,
    artist,
    album,
    duration: duration ?? '',
    thumbnail: largestThumbnail(field(node, 'thumbnail', 'musicThumbnailRenderer', 'thumbnail')),
  }
}

function twoRowTrack(node) {
  const videoId = field(node, 'navigationEndpoint', 'watchEndpoint', 'videoId')
  if (!videoId) return null
  const { artist, album } = splitByline(joinRuns(node.subtitle))
  return {
    videoId,
    title: joinRuns(node.title),
    artist,
    album,
    duration: '',
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

export function parseHomeShelves(payload) {
  return findNodes(payload, 'musicCarouselShelfRenderer')
    .map((carousel) => ({
      title: joinRuns(field(carousel, 'header', 'musicCarouselShelfBasicHeaderRenderer', 'title')),
      tracks: (carousel.contents ?? []).map(anyTrack).filter(Boolean),
    }))
    .filter((shelf) => shelf.tracks.length > 0)
}

export function parseQueue(payload) {
  return findNodes(payload, 'playlistPanelVideoRenderer')
    .filter((row) => row.videoId)
    .map((row) => ({
      videoId: row.videoId,
      title: joinRuns(row.title),
      artist: joinRuns(row.longBylineText),
      album: '',
      duration: joinRuns(row.lengthText),
      thumbnail: largestThumbnail(row.thumbnail),
    }))
}

export function parseStream(payload, container = 'mp4') {
  const status = payload?.playabilityStatus?.status
  const videoId = payload?.videoDetails?.videoId ?? ''
  if (status && status !== 'OK') {
    const reason = payload?.playabilityStatus?.reason ?? 'no reason given'
    throw new Error(`player "${videoId}" is ${status}: ${reason}`)
  }

  const formats = (payload?.streamingData?.adaptiveFormats ?? []).filter(
    (format) => format.mimeType?.startsWith('audio/') && format.url,
  )
  if (formats.length === 0) {
    throw new Error(`player "${videoId}" returned no audio format with a direct url`)
  }
  const best = formats.reduce((winner, format) =>
    audioScore(format, container) > audioScore(winner, container) ? format : winner,
  )

  return {
    videoId,
    title: payload?.videoDetails?.title ?? '',
    author: payload?.videoDetails?.author ?? '',
    duration: Number(payload?.videoDetails?.lengthSeconds ?? 0),
    audioUrl: best.url,
    mimeType: best.mimeType,
    itag: best.itag,
    bitrate: best.bitrate,
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

export function parseAccount(payload) {
  const [header] = findNodes(payload, 'activeAccountHeaderRenderer')
  return { displayName: header ? joinRuns(header.accountName) : '' }
}

const PARSERS = {
  music_home: parseHomeShelves,
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
  if (command === 'music_stream') return parser(payload, options.container)
  return parser(payload)
}
