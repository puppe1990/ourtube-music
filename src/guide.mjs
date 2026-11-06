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

export function isLibraryBrowseId(browseId) {
  const id = String(browseId ?? '')
  return (
    id === LIBRARY_BROWSE_ID || id.startsWith('FEmusic_liked') || id.startsWith('FEmusic_library')
  )
}

export function feedHeading(browseId) {
  if (browseId === EXPLORE_BROWSE_ID) return 'Explorar'
  if (isLibraryBrowseId(browseId)) return 'Biblioteca'
  return 'Início'
}

export function guideKind(browseId) {
  if (browseId === HOME_BROWSE_ID) return 'home'
  if (browseId === EXPLORE_BROWSE_ID) return 'explore'
  if (isLibraryBrowseId(browseId)) return 'library'
  return 'item'
}

export function libraryNeedsLogin(browseId, message) {
  return isLibraryBrowseId(browseId) && Boolean(String(message ?? '').trim())
}

export function shelfCountLabel(tracks) {
  const items = Array.isArray(tracks) ? tracks : []
  const n = items.length
  if (n === 0) return ''
  if (items.every((track) => isAlbumBrowseId(track?.browseId))) {
    return n === 1 ? '1 álbum' : `${n} álbuns`
  }
  if (items.every((track) => isArtistBrowseId(track?.browseId))) {
    return n === 1 ? '1 artista' : `${n} artistas`
  }
  return n === 1 ? '1 faixa' : `${n} faixas`
}

export function isAlbumBrowseId(browseId) {
  return String(browseId ?? '').startsWith('MPREb_')
}

export function isArtistBrowseId(browseId) {
  return String(browseId ?? '').startsWith('UC')
}

export function isCatalogBrowseId(browseId) {
  return isAlbumBrowseId(browseId) || isArtistBrowseId(browseId)
}

export function catalogHref(track) {
  const browseId = track?.browseId ?? ''
  if (isCatalogBrowseId(browseId)) return `#/browse/${encodeURIComponent(browseId)}`
  if (track?.videoId) {
    const list = track.playlistId ? `?list=${encodeURIComponent(track.playlistId)}` : ''
    return `#/watch/${encodeURIComponent(track.videoId)}${list}`
  }
  return ''
}

function hashHref(hash) {
  const clean = String(hash ?? '').replace(/^#/, '')
  return clean ? `#${clean}` : '#/'
}

export function stepHref(hash, videoId, playlistId) {
  const browseId = browseIdFromPath(hash)
  if (isCatalogBrowseId(browseId)) return `#/browse/${encodeURIComponent(browseId)}`
  const list = playlistId ? `?list=${encodeURIComponent(playlistId)}` : ''
  return `#/watch/${encodeURIComponent(videoId)}${list}`
}

export function stepAction(hash, videoId, playlistId) {
  const href = stepHref(hash, videoId, playlistId)
  if (href === hashHref(hash)) return { type: 'play', href }
  return { type: 'navigate', href }
}
