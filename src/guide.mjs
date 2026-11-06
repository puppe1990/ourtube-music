export const HOME_BROWSE_ID = 'FEmusic_home'
export const EXPLORE_BROWSE_ID = 'FEmusic_explore'
export const LIBRARY_BROWSE_ID = 'FEmusic_library_landing'

export function guideHref(browseId) {
  if (!browseId || browseId === HOME_BROWSE_ID) return '#/'
  return `#/browse/${encodeURIComponent(browseId)}`
}

export function browseIdFromPath(path) {
  const clean = String(path ?? '')
    .replace(/^#/, '')
    .split('?')[0]
  if (!clean || clean === '/') return HOME_BROWSE_ID
  const match = /^\/browse\/([^/]+)$/.exec(clean)
  return match ? decodeURIComponent(match[1]) : ''
}

export function feedHeading(browseId) {
  if (browseId === EXPLORE_BROWSE_ID) return 'Explorar'
  if (browseId === LIBRARY_BROWSE_ID) return 'Biblioteca'
  return 'Início'
}

export function isAlbumBrowseId(browseId) {
  return String(browseId ?? '').startsWith('MPREb_')
}

export function catalogHref(track) {
  const browseId = track?.browseId ?? ''
  if (isAlbumBrowseId(browseId)) return `#/browse/${encodeURIComponent(browseId)}`
  if (track?.videoId) {
    const list = track.playlistId ? `?list=${encodeURIComponent(track.playlistId)}` : ''
    return `#/watch/${encodeURIComponent(track.videoId)}${list}`
  }
  return ''
}
