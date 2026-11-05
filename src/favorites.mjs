export function readFavorites(raw) {
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_error) {
    return []
  }
}

export function isFavorite(favorites, videoId) {
  return favorites.some((track) => track.videoId === videoId)
}

export function toggleFavorite(favorites, videoIdOrTrack) {
  const track = typeof videoIdOrTrack === 'string' ? { videoId: videoIdOrTrack } : videoIdOrTrack
  if (isFavorite(favorites, track.videoId)) {
    return favorites.filter((item) => item.videoId !== track.videoId)
  }
  return [track, ...favorites]
}
