export function isOfflineSaved(tracks, videoId) {
  const id = String(videoId ?? '')
  if (!id) return false
  return (Array.isArray(tracks) ? tracks : []).some((track) => track.videoId === id)
}

export function albumTracksFromFeed(feed) {
  const tracks = feed?.shelves?.[0]?.tracks
  if (!Array.isArray(tracks)) return []
  return tracks.filter((track) => track?.videoId)
}

export function albumOfflineState(saved, albumTracks) {
  const ids = (Array.isArray(albumTracks) ? albumTracks : [])
    .map((track) => track?.videoId)
    .filter(Boolean)
  if (!ids.length) return 'none'
  const n = ids.filter((id) => isOfflineSaved(saved, id)).length
  if (n === 0) return 'none'
  if (n === ids.length) return 'all'
  return 'partial'
}

export function groupOfflineLibrary(tracks) {
  const items = Array.isArray(tracks) ? tracks : []
  const albums = []
  const singles = []
  const byBrowse = new Map()
  for (const track of items) {
    const browseId = track?.browseId ?? ''
    if (browseId.startsWith('MPREb_')) {
      const group = byBrowse.get(browseId) ?? []
      group.push(track)
      byBrowse.set(browseId, group)
    } else {
      singles.push(track)
    }
  }
  for (const [browseId, group] of byBrowse) {
    if (group.length >= 2) {
      albums.push({
        browseId,
        title: group[0].album || group[0].title,
        artist: group[0].artist,
        thumbnail: group[0].thumbnail,
        tracks: group,
      })
    } else {
      singles.push(...group)
    }
  }
  return { albums, singles }
}

export function offlineButtonLabel(saved) {
  return saved ? 'Remover download' : 'Baixar'
}

export function offlineAlbumLabel(state) {
  if (state === 'all') return 'Remover download'
  if (state === 'partial') return 'Baixar restante'
  return 'Baixar'
}
