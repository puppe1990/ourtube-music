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
