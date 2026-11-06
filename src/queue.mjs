export function nextTrack(tracks, currentVideoId) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null
  const index = tracks.findIndex((track) => track.videoId === currentVideoId)
  if (index < 0) return tracks[0]
  return tracks[(index + 1) % tracks.length]
}

export function nextRepeatMode(mode) {
  if (mode === 'all') return 'one'
  if (mode === 'one') return 'off'
  return 'all'
}

export function followingTrack(tracks, currentVideoId, { repeat } = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null
  const index = tracks.findIndex((track) => track.videoId === currentVideoId)
  if (index < 0) return tracks[0]
  if (index + 1 < tracks.length) return tracks[index + 1]
  if (repeat === 'all') return tracks[0]
  return null
}

export function shuffleQueue(tracks, currentVideoId, random = Math.random) {
  const list = Array.isArray(tracks) ? [...tracks] : []
  const index = list.findIndex((track) => track.videoId === currentVideoId)
  const current = index >= 0 ? list.splice(index, 1)[0] : null
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return current ? [current, ...list] : list
}

export function repeatButtonLabel(mode) {
  if (mode === 'all') return 'Repetindo a fila'
  if (mode === 'one') return 'Repetindo esta faixa'
  return 'Repetir'
}

export function shuffleButtonLabel(on) {
  return on ? 'Ordem aleatória ativada' : 'Ordem aleatória'
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
