export function nextTrack(tracks, currentVideoId) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null
  const index = tracks.findIndex((track) => track.videoId === currentVideoId)
  if (index < 0) return tracks[0]
  return tracks[(index + 1) % tracks.length]
}

export function upNext(tracks, currentVideoId) {
  if (!Array.isArray(tracks) || tracks.length === 0) return []
  const index = tracks.findIndex((track) => track.videoId === currentVideoId)
  const seen = new Set(index < 0 ? [] : [currentVideoId])
  const queued = []
  for (const track of tracks.slice(index + 1)) {
    if (seen.has(track.videoId)) continue
    seen.add(track.videoId)
    queued.push(track)
  }
  return queued
}

export function shouldReplaceQueue(currentQueue, incoming, { videoId, playlistId } = {}) {
  if (!Array.isArray(incoming) || incoming.length === 0) return false
  if (playlistId) return true
  const current = Array.isArray(currentQueue) ? currentQueue : []
  if (current.length > 1 && current.some((track) => track.videoId === videoId)) return false
  return true
}
