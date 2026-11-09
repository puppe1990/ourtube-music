import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OFFLINE_DIR = 'offline'
const INDEX_FILE = 'index.json'
const MEDIA_DIR = 'media'

export function sanitizeVideoId(videoId) {
  const id = String(videoId ?? '').trim()
  if (id.length < 6 || id.length > 20 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(
      `videoId ${JSON.stringify(id)} is invalid, expected 6–20 chars of [A-Za-z0-9_-]`,
    )
  }
  return id
}

function emptyIndex() {
  return { tracks: [] }
}

function nowSecs() {
  return Math.floor(Date.now() / 1000)
}

export function createOfflineNode({ dir }) {
  const root = join(dir, OFFLINE_DIR)
  mkdirSync(join(root, MEDIA_DIR), { recursive: true })

  function indexPath() {
    return join(root, INDEX_FILE)
  }

  function mediaPath(videoId) {
    return join(root, MEDIA_DIR, `${videoId}.m4a`)
  }

  function loadIndex() {
    if (!existsSync(indexPath())) return emptyIndex()
    try {
      const parsed = JSON.parse(readFileSync(indexPath(), 'utf8'))
      return { tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [] }
    } catch {
      return emptyIndex()
    }
  }

  function saveIndex(index) {
    mkdirSync(join(root, MEDIA_DIR), { recursive: true })
    const tmp = `${indexPath()}.tmp`
    writeFileSync(tmp, JSON.stringify(index, null, 2), { mode: 0o600 })
    renameSync(tmp, indexPath())
  }

  function list() {
    return loadIndex().tracks
  }

  function bytesTotal() {
    return list().reduce((sum, track) => sum + Number(track.bytes || 0), 0)
  }

  function get(videoId) {
    return list().find((track) => track.videoId === videoId) ?? null
  }

  function has(videoId) {
    return Boolean(get(videoId))
  }

  function put(track, bytes) {
    const videoId = sanitizeVideoId(track.videoId)
    const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    const row = {
      videoId,
      title: track.title || '',
      artist: track.artist || '',
      album: track.album || '',
      duration: track.duration || '',
      thumbnail: track.thumbnail || '',
      browseId: track.browseId || '',
      playlistId: track.playlistId || '',
      bytes: payload.length,
      mimeType: track.mimeType || 'audio/mp4',
      savedAt: track.savedAt || nowSecs(),
    }
    const tmp = `${mediaPath(videoId)}.tmp`
    writeFileSync(tmp, payload, { mode: 0o600 })
    renameSync(tmp, mediaPath(videoId))
    const index = loadIndex()
    const existing = index.tracks.findIndex((item) => item.videoId === videoId)
    if (existing >= 0) index.tracks[existing] = row
    else index.tracks.unshift(row)
    saveIndex(index)
    return row
  }

  function remove(videoId) {
    const id = sanitizeVideoId(videoId)
    const index = loadIndex()
    const next = index.tracks.filter((track) => track.videoId !== id)
    const changed = next.length !== index.tracks.length
    if (changed) saveIndex({ tracks: next })
    const file = mediaPath(id)
    if (existsSync(file)) unlinkSync(file)
    return changed
  }

  function removeAlbum(browseId) {
    const id = String(browseId ?? '').trim()
    if (!id) throw new Error('browseId is empty, expected an MPREb_ album id')
    const ids = list()
      .filter((track) => track.browseId === id)
      .map((track) => track.videoId)
    for (const videoId of ids) remove(videoId)
    return ids
  }

  function readMedia(videoId) {
    try {
      const id = sanitizeVideoId(videoId)
      const track = get(id)
      if (!track || !existsSync(mediaPath(id))) return null
      return { mime: track.mimeType || 'audio/mp4', bytes: readFileSync(mediaPath(id)) }
    } catch {
      return null
    }
  }

  return {
    list,
    bytesTotal,
    get,
    has,
    put,
    remove,
    removeAlbum,
    readMedia,
    view() {
      return { tracks: list(), bytesTotal: bytesTotal() }
    },
  }
}
