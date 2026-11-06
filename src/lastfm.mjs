export const LASTFM_ACCOUNT_URL = 'https://www.last.fm/api/account/create'

const MIN_DURATION_SEC = 30
const MAX_LISTEN_SEC = 240

export function shouldScrobble({ durationSec, playedSec }) {
  if (!Number.isFinite(durationSec) || durationSec <= MIN_DURATION_SEC) return false
  if (!Number.isFinite(playedSec) || playedSec < 0) return false
  return playedSec >= Math.min(durationSec / 2, MAX_LISTEN_SEC)
}

export function lastFmButtonLabel(state) {
  if (state?.username) return `Last.fm · ${state.username}`
  if (state?.pending) return 'Concluir Last.fm'
  return 'Conectar Last.fm'
}

export function lastFmClickAction(state) {
  if (state?.connected || state?.username) return 'logout'
  if (state?.pending) return 'complete'
  return 'login'
}

export function lastFmMissingKeysError() {
  return `Crie um app em ${LASTFM_ACCOUNT_URL} e coloque LASTFM_API_KEY e LASTFM_API_SECRET no ambiente, ou em lastfm.json na pasta de configuração do OurTube Music.`
}

const VIEW_OR_PLAY = /(tocou|visualiza|\bviews?\b|\bplays?\b|reprodu)/i

function looksLikeClock(text) {
  return text.length > 0 && text.length <= 8 && text.includes(':') && /^[\d:]+$/.test(text)
}

function isCatalogType(text) {
  return /^(álbum|album|ep|single|playlist|mixtape)$/i.test(text)
}

export function lastFmCredit(track) {
  const parts = [track?.artist, track?.album]
    .flatMap((value) => String(value ?? '').split('•'))
    .map((part) => part.trim())
    .filter((part) => part && !VIEW_OR_PLAY.test(part) && !looksLikeClock(part))

  if (parts.length === 0) return { artist: '', album: '' }
  if (isCatalogType(parts[0])) return { artist: parts[1] ?? '', album: parts[0] }
  return { artist: parts[0], album: parts[1] ?? '' }
}

export function nowPlayingPayload(track, { durationSec } = {}) {
  const { artist, album } = lastFmCredit(track)
  return {
    artist,
    track: track.title,
    album,
    duration: Number.isFinite(durationSec) ? Math.floor(durationSec) : 0,
  }
}

export function scrobblePayload(track, { timestamp, durationSec }) {
  return {
    ...nowPlayingPayload(track, { durationSec }),
    timestamp,
  }
}

function hasCredit(track) {
  return Boolean(lastFmCredit(track).artist && track?.title)
}

export function createLastFmScrobbler({
  nowPlaying,
  scrobble,
  now = () => Math.floor(Date.now() / 1000),
}) {
  let videoId = ''
  let sent = false
  let startedAt = 0

  return {
    async onPlay(track, durationSec) {
      videoId = track?.videoId ?? ''
      sent = false
      startedAt = now()
      if (!hasCredit(track)) return
      await nowPlaying(nowPlayingPayload(track, { durationSec }))
    },
    async onProgress(track, { durationSec, playedSec }) {
      if (!hasCredit(track)) return
      if ((track.videoId ?? '') !== videoId) return
      if (sent) return
      if (!shouldScrobble({ durationSec, playedSec })) return
      sent = true
      await scrobble(scrobblePayload(track, { timestamp: startedAt, durationSec }))
    },
  }
}
