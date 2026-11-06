export const LRCLIB_USER_AGENT = 'OurTubeMusic/0.2.0 (https://github.com/puppe1990/ourtube-music)'

export function lrclibSearchUrl({ track, artist } = {}) {
  const params = new URLSearchParams()
  params.set('track_name', String(track ?? '').trim())
  params.set('artist_name', String(artist ?? '').trim())
  return `https://lrclib.net/api/search?${params}`
}

export function pickSyncedLyricsHit(hits, durationSec) {
  const synced = (Array.isArray(hits) ? hits : []).filter((hit) =>
    String(hit?.syncedLyrics ?? '').trim(),
  )
  if (!synced.length) return null
  const target = Number(durationSec)
  if (!Number.isFinite(target) || target <= 0) return synced[0]
  return synced.reduce((best, hit) => {
    const delta = Math.abs(Number(hit.duration) - target)
    const bestDelta = Math.abs(Number(best.duration) - target)
    return delta < bestDelta ? hit : best
  })
}

export async function fetchSyncedLyrics({
  track,
  artist,
  durationSec,
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  const title = String(track ?? '').trim()
  const name = String(artist ?? '').trim()
  if (!title || !name) return ''
  try {
    const response = await fetchImpl(lrclibSearchUrl({ track: title, artist: name }), {
      headers: { 'user-agent': LRCLIB_USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response?.ok) return ''
    const hits = await response.json()
    return pickSyncedLyricsHit(hits, durationSec)?.syncedLyrics ?? ''
  } catch (_error) {
    return ''
  }
}
