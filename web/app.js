import { createMusicApi, resolveInvoker } from '/src/api.mjs'
import { isFavorite, readFavorites, toggleFavorite } from '/src/favorites.mjs'
import { formatBitrate, formatDuration, shorten } from '/src/format.mjs'
import {
  HOME_BROWSE_ID,
  browseIdFromPath,
  catalogHref,
  feedHeading,
  guideHref,
  isAlbumBrowseId,
  isArtistBrowseId,
  isCatalogBrowseId,
  libraryNeedsLogin,
  shelfCountLabel,
  stepAction,
} from '/src/guide.mjs'
import {
  currentLyricIndex,
  lyricLineState,
  lyricsAriaLabel,
  lyricsUnavailable,
  renderLyricsHtml,
  shareLyricsText,
} from '/src/lyrics.mjs'
import { largerCoverUrl, nowPlayingAriaLabel, syncNowPlayingGlyphs } from '/src/nowPlaying.mjs'
import { playPauseAriaLabel, syncPlayPauseIcons } from '/src/playback.mjs'
import {
  followingTrack,
  nextRepeatMode,
  repeatButtonLabel,
  shouldReplaceQueue,
  shuffleButtonLabel,
  shuffleQueue,
  upNext,
} from '/src/queue.mjs'
import { accountMenuModel, renderAccountButton, renderAccountMenu } from '/src/accountMenu.mjs'
import {
  createLastFmScrobbler,
  lastFmButtonLabel,
  lastFmClickAction,
  lastFmCredit,
} from '/src/lastfm.mjs'
import { accountLabel } from '/src/session.mjs'

const api = createMusicApi(resolveInvoker())
const lastFm = createLastFmScrobbler({
  nowPlaying: (payload) => api.lastfmNowPlaying(payload),
  scrobble: (payload) => api.lastfmScrobble(payload),
})
const state = {
  shelves: [],
  chips: [],
  homeChips: [],
  results: [],
  queue: [],
  current: null,
  recent: [],
  favorites: [],
  filter: '',
  homeLoaded: false,
  guide: [],
  album: null,
  nowPlayingOpen: false,
  lyricsOpen: false,
  lyrics: { lines: [], cues: [], source: '', message: '' },
  lyricCursor: -2,
  lastfm: { connected: false, username: '', pending: false, hasKeys: false },
  repeat: 'off',
  shuffle: false,
}

const SEARCH_CHIPS = [
  { label: 'Tudo', filter: '' },
  { label: 'Músicas', filter: 'song' },
  { label: 'Vídeos', filter: 'video' },
]

const $ = (selector) => document.querySelector(selector)

const dom = {
  main: $('#main'),
  guide: $('#guide'),
  form: $('#search'),
  input: $('#search-input'),
  suggestions: $('#suggestions'),
  chips: $('#chips'),
  account: $('#account'),
  accountMenu: $('#account-menu'),
  accountSlot: $('#account-slot'),
  lastfm: $('#lastfm'),
  theme: $('#theme-toggle'),
  favorites: $('#favorites'),
  recent: $('#recent'),
  player: $('#player'),
  audio: $('#audio'),
  art: $('#player-art'),
  title: $('#player-title'),
  artist: $('#player-artist'),
  meta: $('#player-meta'),
  heart: $('#heart'),
  playPause: $('#play-pause'),
  iconPlay: $('#icon-play'),
  iconPause: $('#icon-pause'),
  repeat: $('#repeat'),
  repeatOne: $('#repeat-one'),
  prev: $('#prev'),
  next: $('#next'),
  shuffle: $('#shuffle'),
  progress: $('#progress'),
  elapsed: $('#elapsed'),
  total: $('#total'),
  volume: $('#volume'),
  status: $('#status'),
  expand: $('#expand-player'),
  iconExpand: $('#icon-expand'),
  iconCollapse: $('#icon-collapse'),
  nowPlaying: $('#now-playing'),
  nowPlayingArt: $('#now-playing-art'),
  nowPlayingBackdrop: $('#now-playing-backdrop'),
  nowPlayingTitle: $('#now-playing-title'),
  nowPlayingArtist: $('#now-playing-artist'),
  openLyrics: $('#open-lyrics'),
  lyrics: $('#lyrics'),
  lyricsBackdrop: $('#lyrics-backdrop'),
  lyricsLines: $('#lyrics-lines'),
  closeLyrics: $('#close-lyrics'),
  shareLyrics: $('#share-lyrics'),
  loginDialog: $('#login-dialog'),

  loginStatus: $('#login-status'),
  logoutDialog: $('#logout-dialog'),
  logoutConfirm: $('#logout-confirm'),
}

const ICON_PLAY =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7z"></path></svg>'
const ICON_SHUFFLE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20l6.5-6.5M21 8l-6.5 6.5M16 21h5v-5M15 15l6 6M4 4l5 5"></path></svg>'
const ICON_MIX =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="16" r="1.6" fill="currentColor" stroke="none"></circle><path d="M8.2 13.2a5 5 0 0 1 7.6 0M6 10.6a8 8 0 0 1 12 0"></path></svg>'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function setStatus(message, tone = 'info') {
  dom.status.textContent = message ?? ''
  dom.status.dataset.tone = tone
}

function art(track, className) {
  if (!track?.thumbnail) return `<div class="${className} art-empty"></div>`
  return `<img class="${className}" src="${escapeHtml(track.thumbnail)}" alt="" loading="lazy" />`
}

function byline(track) {
  return [track.artist, track.album].filter(Boolean).join(' • ')
}

function playAttrs(track) {
  const attrs = []
  if (track.browseId) attrs.push(`data-browse-id="${escapeHtml(track.browseId)}"`)
  if (track.videoId) attrs.push(`data-video-id="${escapeHtml(track.videoId)}"`)
  if (track.playlistId) attrs.push(`data-playlist-id="${escapeHtml(track.playlistId)}"`)
  return attrs.join(' ')
}

function catalogTag(track, className, inner) {
  const href = catalogHref(track)
  const tag = href ? 'a' : 'button'
  const extra = href ? `href="${href}"` : 'type="button"'
  return `<${tag} class="${className}" ${extra} ${playAttrs(track)}>${inner}</${tag}>`
}

/* ── cards / lists ──────────────────────────────────────────────────────── */
function quickCard(track) {
  return catalogTag(
    track,
    'quick-card',
    `${art(track, 'quick-art')}
    <span class="quick-text">
      <strong>${escapeHtml(shorten(track.title, 34))}</strong>
      <span>${escapeHtml(shorten(byline(track), 40))}</span>
    </span>
    <span class="quick-play" aria-hidden="true">${ICON_PLAY}</span>`,
  )
}

function shelfCard(track) {
  const kind = isArtistBrowseId(track.browseId) ? 'card card-circle' : 'card'
  return catalogTag(
    track,
    kind,
    `<span class="card-art">
      ${art(track, 'card-img')}
      <span class="card-play" aria-hidden="true">${ICON_PLAY}</span>
    </span>
    <strong>${escapeHtml(shorten(track.title, 46))}</strong>
    <span>${escapeHtml(shorten(track.artist, 34))}</span>`,
  )
}

function eqBars() {
  return '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>'
}

function row(track, index) {
  const current = state.current?.videoId === track.videoId
  return `<li>
    <button class="track-row" type="button" data-video-id="${escapeHtml(track.videoId)}" data-current="${current}">
      <span class="track-index">${index + 1}</span>
      ${art(track, 'track-img')}
      <span class="track-text">
        <strong>${escapeHtml(track.title)}${current ? eqBars() : ''}</strong>
        <span>${escapeHtml(byline(track))}</span>
      </span>
      <span class="track-duration">${escapeHtml(track.duration)}</span>
    </button>
  </li>`
}

function albumRow(track, index) {
  const current = state.current?.videoId === track.videoId
  return `<li>
    <button class="track-row album-row" type="button" ${playAttrs(track)} data-current="${current}">
      <span class="track-index">${current ? ICON_PLAY : index + 1}</span>
      <span class="track-text">
        <strong>${escapeHtml(track.title)}</strong>
        <span>${escapeHtml(track.playCount || byline(track))}</span>
      </span>
      <span class="track-duration">${escapeHtml(track.duration)}</span>
    </button>
  </li>`
}

function artistRow(track) {
  const current = state.current?.videoId === track.videoId
  return `<li>
    <button class="track-row artist-row" type="button" ${playAttrs(track)} data-current="${current}">
      ${art(track, 'artist-row-art')}
      <span class="track-text"><strong>${escapeHtml(track.title)}</strong></span>
      <span class="artist-row-cell">${escapeHtml(track.artist)}</span>
      <span class="artist-row-cell artist-row-plays">${escapeHtml(track.playCount)}</span>
      <span class="artist-row-cell artist-row-album">${escapeHtml(track.album)}</span>
    </button>
  </li>`
}

function artistAction(label, icon, videoId, playlistId) {
  if (!videoId) return ''
  return `<button class="artist-action" type="button" data-video-id="${escapeHtml(videoId)}" data-playlist-id="${escapeHtml(playlistId)}" data-radio="true">${icon}<span>${escapeHtml(label)}</span></button>`
}

function trackList(tracks, emptyMessage = 'Nenhuma faixa por aqui.') {
  if (!tracks.length) return `<p class="empty">${escapeHtml(emptyMessage)}</p>`
  return `<ul class="track-list">${tracks.map(row).join('')}</ul>`
}

/* ── views ──────────────────────────────────────────────────────────────── */
function quickPicks() {
  return state.shelves
    .flatMap((shelf) => shelf.tracks)
    .filter((track) => track.videoId || track.playlistId)
    .slice(0, 6)
}

function renderMoodChips() {
  if (!state.chips.length) return
  dom.chips.setAttribute('aria-label', 'Humor e momentos')
  dom.chips.innerHTML = state.chips
    .map(
      (chip) =>
        `<button class="chip${chip.selected ? ' is-active' : ''}" type="button" data-chip-params="${escapeHtml(
          chip.params,
        )}">${escapeHtml(chip.label)}</button>`,
    )
    .join('')
}

function renderSearchChips() {
  dom.chips.setAttribute('aria-label', 'Filtrar resultados')
  dom.chips.innerHTML = SEARCH_CHIPS.map(
    (chip) =>
      `<button class="chip${state.filter === chip.filter ? ' is-active' : ''}" type="button" data-filter="${escapeHtml(
        chip.filter,
      )}">${escapeHtml(chip.label)}</button>`,
  ).join('')
}

function renderHome() {
  if (!state.shelves.length) {
    dom.main.innerHTML = state.homeLoaded
      ? `<div class="empty">A home veio vazia agora. <button type="button" class="link-button" data-retry-home>Tentar de novo</button></div>`
      : '<p class="empty">Carregando a home…</p>'
    return
  }
  const picks = quickPicks()
  const shelves = state.shelves
    .map(
      (shelf) => `<section class="shelf">
        <div class="shelf-head">
          <div>
            <h2 class="section-title">${escapeHtml(shelf.title)}</h2>
            <p class="shelf-sub">${escapeHtml(shelfCountLabel(shelf.tracks))}</p>
          </div>
        </div>
        <div class="shelf-rail">${shelf.tracks.map(shelfCard).join('')}</div>
      </section>`,
    )
    .join('')

  dom.main.innerHTML = `
    <section class="hero">
      <h1>${escapeHtml(feedHeading(HOME_BROWSE_ID))}</h1>
    </section>
    <section class="quick-grid">${picks.map(quickCard).join('')}</section>
    ${shelves}`
}

function renderSearch(query, tracks) {
  const visible = tracks.filter((track) => matchesFilter(track))
  dom.main.innerHTML = `
    <section class="hero">
      <h1>Resultados</h1>
    </section>
    <section class="shelf">
      <div class="shelf-head">
        <div>
          <h2 class="section-title">“${escapeHtml(query)}”</h2>
          <p class="shelf-sub">${visible.length === 1 ? '1 item' : `${visible.length} itens`}</p>
        </div>
      </div>
      ${trackList(visible, 'Nada encontrado com esse filtro.')}
    </section>`
}

function matchesFilter(track) {
  if (!state.filter) return true
  const kind = /video/i.test(track.artist) && !/song/i.test(track.artist) ? 'video' : 'song'
  return kind === state.filter
}

function renderWatch(track) {
  const queued = upNext(state.queue, track.videoId)
  dom.main.innerHTML = `
    <section class="hero-card">
      ${art(track, 'hero-art')}
      <div>
        <h1>${escapeHtml(track.title || 'Tocando agora')}</h1>
        <p>${escapeHtml(byline(track))}</p>
        ${track.duration ? `<p class="hero-card-meta">${escapeHtml(track.duration)}</p>` : ''}
      </div>
    </section>
    <section class="shelf">
      <div class="shelf-head">
        <div>
          <h2 class="section-title">A seguir</h2>
          <p class="shelf-sub">${queued.length} faixas na fila</p>
        </div>
      </div>
      ${trackList(queued, 'Sem próximas faixas nesta fila.')}
    </section>`
}

function renderFavorites() {
  dom.main.innerHTML = `
    <section class="hero">
      <h1>Músicas curtidas</h1>
    </section>
    <section class="shelf">
      <div class="shelf-head">
        <div>
          <h2 class="section-title">${state.favorites.length} faixas salvas</h2>
          <p class="shelf-sub">Guardadas neste Mac</p>
        </div>
      </div>
      ${trackList(state.favorites, 'Toque no coração do player para curtir uma faixa.')}
    </section>`
}

function renderGuide(entries) {
  if (entries) state.guide = entries
  const current = browseIdFromPath(location.hash) || HOME_BROWSE_ID
  dom.guide.innerHTML = state.guide
    .map(
      (entry) =>
        `<a href="${guideHref(entry.browseId)}" data-browse="${escapeHtml(entry.browseId)}" ${
          entry.browseId === current ? 'aria-current="true"' : ''
        }>${escapeHtml(entry.label)}</a>`,
    )
    .join('')
}

function renderRecent() {
  dom.recent.innerHTML = state.recent
    .map(
      (term) =>
        `<li><button type="button" data-term="${escapeHtml(term)}">${escapeHtml(term)}</button></li>`,
    )
    .join('')
}

/* ── playback ───────────────────────────────────────────────────────────── */
function refreshPlayPauseIcon() {
  const playing = !dom.audio.paused
  syncPlayPauseIcons(dom.iconPlay, dom.iconPause, playing)
  dom.playPause.setAttribute('aria-label', playPauseAriaLabel(playing))
}

function refreshNowPlayingCover() {
  const src = largerCoverUrl(state.current?.thumbnail || dom.art.src)
  dom.nowPlayingArt.src = src
  dom.nowPlayingBackdrop.src = src
  dom.nowPlayingTitle.textContent = state.current?.title || dom.title.textContent
  dom.nowPlayingArtist.textContent = state.current?.artist || dom.artist.textContent
}

function applyNowPlayingDom() {
  if (state.nowPlayingOpen) refreshNowPlayingCover()
  dom.nowPlaying.toggleAttribute('hidden', !state.nowPlayingOpen)
  dom.nowPlaying.setAttribute('aria-hidden', state.nowPlayingOpen ? 'false' : 'true')
  syncNowPlayingGlyphs(dom.iconExpand, dom.iconCollapse, state.nowPlayingOpen)
  dom.expand.setAttribute('aria-label', nowPlayingAriaLabel(state.nowPlayingOpen))
  dom.expand.setAttribute('aria-expanded', state.nowPlayingOpen ? 'true' : 'false')
}

function setNowPlayingOpen(open) {
  if (open && state.lyricsOpen) {
    state.lyricsOpen = false
    applyLyricsDom()
  }
  state.nowPlayingOpen = Boolean(open)
  applyNowPlayingDom()
}

function paintLyrics(lyrics) {
  const cues = Array.isArray(lyrics?.cues) ? lyrics.cues : []
  const lines = lyrics?.lines ?? []
  const message = lyrics?.message || (lines.length || cues.length ? '' : lyricsUnavailable())
  const timeMs = Math.round((dom.audio.currentTime || 0) * 1000)
  state.lyricCursor = -2
  dom.lyricsLines.innerHTML = renderLyricsHtml({ lines, cues, message }, timeMs)
  const cover = largerCoverUrl(state.current?.thumbnail || dom.art.src)
  if (cover) dom.lyricsBackdrop.src = cover
  syncLyricsCursor(true)
}

function syncLyricsCursor(force = false) {
  if (!state.lyricsOpen) return
  const cues = state.lyrics?.cues
  if (!Array.isArray(cues) || cues.length === 0) return
  const timeMs = Math.round((dom.audio.currentTime || 0) * 1000)
  const current = currentLyricIndex(cues, timeMs)
  if (!force && current === state.lyricCursor) return
  state.lyricCursor = current
  const nodes = dom.lyricsLines.querySelectorAll('p[data-start-ms]')
  nodes.forEach((node, index) => {
    node.className = lyricLineState(index, current)
  })
  const active = current >= 0 ? nodes[current] : nodes[0]
  active?.scrollIntoView({ block: 'center', behavior: force ? 'auto' : 'smooth' })
}

function applyLyricsDom() {
  dom.lyrics.toggleAttribute('hidden', !state.lyricsOpen)
  dom.lyrics.setAttribute('aria-hidden', state.lyricsOpen ? 'false' : 'true')
  dom.openLyrics.setAttribute('aria-label', lyricsAriaLabel(state.lyricsOpen))
  dom.openLyrics.setAttribute('aria-expanded', state.lyricsOpen ? 'true' : 'false')
}

async function loadLyrics() {
  const videoId = state.current?.videoId
  if (!videoId) {
    paintLyrics({ lines: [], message: lyricsUnavailable() })
    return
  }
  paintLyrics({ lines: [], message: 'Carregando…' })
  try {
    const lyrics = await api.lyrics(videoId, {
      title: state.current?.title || '',
      artist: state.current?.artist || '',
      durationSec: Number(dom.audio.duration) || Number(state.current?.durationSec) || undefined,
    })
    if (state.current?.videoId !== videoId) return
    state.lyrics = lyrics
    paintLyrics(lyrics)
  } catch (error) {
    paintLyrics({ lines: [], message: error.message || lyricsUnavailable() })
  }
}

function setLyricsOpen(open) {
  if (open && state.nowPlayingOpen) {
    state.nowPlayingOpen = false
    applyNowPlayingDom()
  }
  state.lyricsOpen = Boolean(open)
  applyLyricsDom()
  if (state.lyricsOpen) loadLyrics()
}

function findTrack(videoId) {
  const pools = [state.queue, state.results, state.favorites, ...state.shelves.map((s) => s.tracks)]
  return pools.flat().find((track) => track.videoId === videoId) ?? null
}

function isWatchRoute() {
  return location.hash.replace(/^#/, '').startsWith('/watch/')
}

function refreshNowPlayingView() {
  if (isWatchRoute()) {
    if (state.current) renderWatch(state.current)
    return
  }
  if (state.album && isCatalogBrowseId(browseIdFromPath(location.hash))) {
    renderCatalogPage(state.album.browseId, state.album.feed)
  }
}

async function play(track, queue) {
  state.current = track
  const incoming = queue?.length ? queue : [track]
  state.queue = state.shuffle ? shuffleQueue(incoming, track.videoId) : incoming
  refreshNowPlayingView()
  dom.player.hidden = false
  dom.title.textContent = track.title || '—'
  dom.artist.textContent = track.artist || '—'
  dom.art.src = track.thumbnail || ''
  refreshNowPlayingCover()
  setStatus('resolvendo áudio…')
  refreshHeart()

  try {
    const [stream, audioSrc] = await Promise.all([
      api.stream(track.videoId),
      api.audio(track.videoId),
    ])
    state.audioBase = audioSrc
    state.variantFallback = false
    dom.audio.src = audioSrc
    dom.audio.load()
    await dom.audio.play().catch(() => setStatus('clique no play', 'info'))
    refreshPlayPauseIcon()

    const queuedRow = state.queue.find((item) => item.videoId === track.videoId)
    const credit = lastFmCredit({
      artist: track.artist || stream.author,
      album: track.album,
    })
    const durationSec = Number(stream.duration) || Number(dom.audio.duration)
    const enriched = {
      ...track,
      title: stream.title || (track.title !== 'Carregando…' ? track.title : ''),
      artist: credit.artist || stream.author,
      album: credit.album,
      duration: track.duration || formatDuration(stream.duration),
      durationSec,
      thumbnail: track.thumbnail || queuedRow?.thumbnail || '',
    }
    state.current = enriched
    refreshNowPlayingView()
    dom.title.textContent = enriched.title
    dom.artist.textContent = enriched.artist
    dom.art.src = enriched.thumbnail || ''
    refreshNowPlayingCover()
    dom.meta.textContent = [
      formatBitrate(stream.bitrate),
      stream.mimeType.includes('mp4') ? 'AAC' : 'Opus',
    ]
      .filter(Boolean)
      .join(' · ')
    dom.total.textContent = formatDuration(stream.duration)
    setStatus('')
    refreshHeart()
    lastFm.onPlay(enriched, enriched.durationSec).catch(() => {})
    if (state.lyricsOpen) loadLyrics()
  } catch (error) {
    setStatus(error.message ?? 'falha ao resolver o áudio', 'error')
  }
}

function watchListId() {
  return new URLSearchParams(location.hash.split('?')[1] ?? '').get('list') ?? ''
}

function watch(videoId) {
  if (state.current?.videoId === videoId && dom.audio.src && !watchListId()) {
    renderWatch(state.current)
    return
  }
  const track = findTrack(videoId) ?? {
    videoId,
    title: 'Carregando…',
    artist: '',
    album: '',
    duration: '',
    thumbnail: '',
  }
  play(track, state.queue.length ? state.queue : [track])
  loadQueue(videoId, watchListId())
}

async function playMix(playlistId) {
  setStatus('abrindo a mix…')
  try {
    const queue = await api.queue('', playlistId)
    const first = queue[0]
    if (!first?.videoId) {
      setStatus('mix sem faixas', 'error')
      return
    }
    state.queue = queue
    location.hash = `#/watch/${first.videoId}?list=${encodeURIComponent(playlistId)}`
  } catch (error) {
    setStatus(error.message ?? 'falha ao abrir a mix', 'error')
  }
}

async function loadQueue(videoId, playlistId) {
  try {
    const queue = playlistId ? await api.queue(videoId, playlistId) : await api.queue(videoId)
    const hash = location.hash.replace(/^#/, '')
    if (!hash.startsWith(`/watch/${videoId}`) || queue.length === 0) return
    if (!shouldReplaceQueue(state.queue, queue, { videoId, playlistId })) return
    state.queue = queue
    const row = queue.find((item) => item.videoId === videoId)
    if (!row || state.current?.videoId !== videoId) return
    state.current = {
      ...state.current,
      thumbnail: state.current.thumbnail || row.thumbnail,
      artist: state.current.artist || row.artist,
    }
    renderWatch(state.current)
    dom.art.src = state.current.thumbnail || ''
  } catch (_error) {
    // Queue is a nicety; the player itself already works without it.
  }
}

function paintTransport() {
  const mode = state.repeat
  dom.repeat.dataset.mode = mode
  dom.repeat.setAttribute('aria-pressed', mode === 'off' ? 'false' : 'true')
  dom.repeat.setAttribute('aria-label', repeatButtonLabel(mode))
  dom.repeatOne.toggleAttribute('hidden', mode !== 'one')
  dom.audio.loop = mode === 'one'
  dom.shuffle.setAttribute('aria-pressed', state.shuffle ? 'true' : 'false')
  dom.shuffle.setAttribute('aria-label', shuffleButtonLabel(state.shuffle))
}

function cycleRepeat() {
  state.repeat = nextRepeatMode(state.repeat)
  paintTransport()
}

function toggleShuffle() {
  state.shuffle = !state.shuffle
  if (state.shuffle && state.current) {
    state.queue = shuffleQueue(state.queue, state.current.videoId)
    refreshNowPlayingView()
  }
  paintTransport()
}

function step(direction) {
  const index = state.queue.findIndex((track) => track.videoId === state.current?.videoId)
  if (index < 0) return
  const following =
    direction > 0
      ? followingTrack(state.queue, state.current.videoId, { repeat: state.repeat })
      : (state.queue[index - 1] ?? state.queue.at(-1))
  if (!following) return
  const playlistId = watchListId() || following.playlistId || ''
  const action = stepAction(location.hash, following.videoId, playlistId)
  if (action.type === 'play') {
    play(following, state.queue)
    return
  }
  location.hash = action.href
}

/* ── favorites ──────────────────────────────────────────────────────────── */
function persistFavorites() {
  try {
    localStorage.setItem('ourtube-favorites', JSON.stringify(state.favorites))
  } catch (_error) {
    // Storage is optional; the session keeps the list in memory.
  }
}

function refreshHeart() {
  const liked = state.current ? isFavorite(state.favorites, state.current.videoId) : false
  dom.heart.setAttribute('aria-pressed', liked ? 'true' : 'false')
}

function toggleCurrentFavorite() {
  if (!state.current) return
  state.favorites = toggleFavorite(state.favorites, state.current)
  persistFavorites()
  refreshHeart()
  if (location.hash.startsWith('#/favorites')) renderFavorites()
}

/* ── data loading ───────────────────────────────────────────────────────── */
function isHomeRoute() {
  const hash = location.hash.replace(/^#/, '') || '/'
  return hash === '/' || hash === ''
}

function readHomeFeed(payload) {
  if (Array.isArray(payload)) return { chips: [], shelves: payload, message: '', header: null }
  return {
    chips: Array.isArray(payload?.chips) ? payload.chips : [],
    shelves: Array.isArray(payload?.shelves) ? payload.shelves : [],
    message: payload?.message ?? '',
    header: payload?.header ?? null,
  }
}

function albumQueue(feed) {
  return (feed?.shelves?.[0]?.tracks ?? []).filter((track) => track.videoId)
}

function albumPlayTarget(feed) {
  const queue = albumQueue(feed)
  return queue.find((track) => track.videoId === feed?.header?.videoId) ?? queue[0] ?? null
}

async function fillCatalogQueue(videoId, playlistId) {
  try {
    const queue = await api.queue(videoId, playlistId)
    if (!queue.length || state.current?.videoId !== videoId) return
    state.queue = queue
  } catch (_error) {
    // Shuffle/mix still plays the seed track if next never arrives.
  }
}

function playCatalogRadio(header, videoId, playlistId) {
  play(
    {
      videoId,
      playlistId: playlistId || '',
      title: header?.title || '',
      artist: header?.artist || header?.title || '',
      thumbnail: header?.thumbnail || '',
    },
    [],
  )
  if (playlistId) fillCatalogQueue(videoId, playlistId)
}

function browseEmpty(browseId, message) {
  const login = libraryNeedsLogin(browseId, message)
    ? ' <button type="button" class="link-button" data-open-login>Fazer login</button>'
    : ''
  return `<p class="empty">${escapeHtml(message || 'Nada por aqui agora.')}${login}</p>`
}

function shelfTracksClass(shelf) {
  return shelf.layout === 'grid' ? 'shelf-grid' : 'shelf-rail'
}

function relatedShelvesHtml(shelves) {
  return (shelves ?? [])
    .map((shelf) => {
      const head = shelf.title
        ? `<div class="shelf-head">
          <div>
            <h2 class="section-title">${escapeHtml(shelf.title)}</h2>
            <p class="shelf-sub">${escapeHtml(shelfCountLabel(shelf.tracks))}</p>
          </div>
        </div>`
        : ''
      return `<section class="shelf">
        ${head}
        <div class="${shelfTracksClass(shelf)}">${shelf.tracks.map(shelfCard).join('')}</div>
      </section>`
    })
    .join('')
}

function renderBrowseChips(chips) {
  if (!chips?.length) {
    dom.chips.innerHTML = ''
    return
  }
  dom.chips.setAttribute('aria-label', 'Filtrar biblioteca')
  dom.chips.innerHTML = chips
    .map(
      (chip) =>
        `<button class="chip${chip.selected ? ' is-active' : ''}" type="button" data-chip-browse="${escapeHtml(
          chip.browseId,
        )}">${escapeHtml(chip.label)}</button>`,
    )
    .join('')
}

function renderBrowsePage(browseId, feed) {
  const title = feedHeading(browseId)
  const shelves = relatedShelvesHtml(feed.shelves)
  dom.main.innerHTML = `
    <section class="hero">
      <h1>${escapeHtml(title)}</h1>
    </section>
    ${shelves || browseEmpty(browseId, feed.message)}`
}

function albumArtistLine(header) {
  const thumb = header.artistThumbnail
    ? `<img class="album-artist-img" src="${escapeHtml(header.artistThumbnail)}" alt="" />`
    : ''
  const name = `<span>${escapeHtml(header.artist)}</span>`
  const href = catalogHref({ browseId: header.artistBrowseId })
  if (!href) return `${thumb}${name}`
  return `<a class="album-artist-link" href="${href}">${thumb}${name}</a>`
}

function renderAlbumPage(browseId, feed) {
  state.album = { browseId, feed }
  const header = feed.header
  const [tracklist, ...related] = feed.shelves ?? []
  const tracks = tracklist?.tracks ?? []
  const playTrack = albumPlayTarget(feed)
  const playButton = playTrack
    ? `<button class="album-play" type="button" ${playAttrs(playTrack)} aria-label="Tocar álbum">${ICON_PLAY}</button>`
    : ''
  const list = tracks.length
    ? `<ol class="track-list album-tracks">${tracks.map(albumRow).join('')}</ol>`
    : `<p class="empty">Este álbum veio sem faixas.</p>`
  dom.main.innerHTML = `
    <section class="album-spread">
      <div class="album-hero">
        <p class="album-artist">${albumArtistLine(header)}</p>
        ${art({ thumbnail: header.thumbnail }, 'album-cover')}
        <h1>${escapeHtml(header.title)}</h1>
        <p class="album-subtitle">${escapeHtml(header.subtitle)}</p>
        <p class="album-meta">${escapeHtml(header.secondSubtitle)}</p>
        ${playButton}
      </div>
      ${list}
    </section>
    ${relatedShelvesHtml(related)}`
}

function renderArtistPage(browseId, feed) {
  state.album = { browseId, feed }
  const header = feed.header
  const [top, ...related] = feed.shelves ?? []
  const tracks = top?.tracks ?? []
  const banner = header.thumbnail
    ? `<img class="artist-banner" src="${escapeHtml(header.thumbnail)}" alt="" />`
    : '<div class="artist-banner art-empty"></div>'
  const subs = header.subscriberCount
    ? `<span class="artist-subs">Inscrito ${escapeHtml(header.subscriberCount)}</span>`
    : ''
  const list = tracks.length
    ? `<ol class="track-list artist-tracks">${tracks.map(artistRow).join('')}</ol>`
    : ''
  const topTitle = top?.title ? `<h2 class="section-title">${escapeHtml(top.title)}</h2>` : ''
  dom.main.innerHTML = `
    <section class="artist-page">
      <header class="artist-hero">
        ${banner}
        <div class="artist-hero-copy">
          <h1>${escapeHtml(header.title)}</h1>
          <div class="artist-actions">
            ${artistAction('Aleatório', ICON_SHUFFLE, header.videoId, header.playlistId)}
            ${artistAction('Mix', ICON_MIX, header.mixVideoId, header.mixPlaylistId)}
            ${subs}
          </div>
        </div>
      </header>
      <div class="artist-body">
        ${topTitle}
        ${list}
        ${relatedShelvesHtml(related)}
      </div>
    </section>`
}

function renderCatalogPage(browseId, feed) {
  if (feed.header?.pageType === 'artist') renderArtistPage(browseId, feed)
  else renderAlbumPage(browseId, feed)
}

function browseLabel(browseId) {
  if (isArtistBrowseId(browseId)) return 'artista'
  if (isAlbumBrowseId(browseId)) return 'álbum'
  return feedHeading(browseId)
}

async function loadBrowse(browseId) {
  renderGuide()
  dom.chips.innerHTML = ''
  const label = browseLabel(browseId)
  dom.main.innerHTML = `<p class="empty">Carregando ${escapeHtml(label)}…</p>`
  try {
    const feed = readHomeFeed(await api.browse(browseId))
    if (browseIdFromPath(location.hash) !== browseId) return
    if (feed.header) renderCatalogPage(browseId, feed)
    else {
      state.album = null
      renderBrowseChips(feed.chips)
      renderBrowsePage(browseId, feed)
    }
  } catch (error) {
    if (browseIdFromPath(location.hash) !== browseId) return
    state.album = null
    dom.main.innerHTML = `<p class="empty">Falha ao carregar: ${escapeHtml(error.message)}</p>`
  }
}

async function loadHome(args = {}) {
  try {
    const feed = readHomeFeed(await api.home(args))
    state.shelves = feed.shelves
    state.chips = feed.chips
    state.homeChips = feed.chips
    state.homeLoaded = true
    if (!isHomeRoute()) return
    renderMoodChips()
    renderHome()
  } catch (error) {
    state.homeLoaded = true
    if (!isHomeRoute()) return
    dom.main.innerHTML = `<p class="empty">Falha ao carregar a home: ${escapeHtml(error.message)}</p>`
  }
}

async function runSearch(query) {
  const term = query.trim()
  if (!term) {
    renderHome()
    return
  }
  rememberSearch(term)
  dom.main.innerHTML = `<p class="empty">Buscando “${escapeHtml(term)}”…</p>`
  try {
    state.results = await api.search(term)
    if (!location.hash.startsWith('#/search')) return
    renderSearch(term, state.results)
  } catch (error) {
    dom.main.innerHTML = `<p class="empty">Falha na busca: ${escapeHtml(error.message)}</p>`
  }
}

function rememberSearch(term) {
  const trimmed = term.trim()
  if (!trimmed) return
  state.recent = [trimmed, ...state.recent.filter((item) => item !== trimmed)].slice(0, 8)
  try {
    localStorage.setItem('ourtube-recent', JSON.stringify(state.recent))
  } catch (_error) {
    // localStorage pode estar indisponível; buscas recentes são opcionais.
  }
  renderRecent()
}

async function loadSuggestions(term) {
  try {
    const suggestions = await api.suggestions(term)
    dom.suggestions.innerHTML = suggestions
      .map(
        (text) =>
          `<li><button type="button" data-term="${escapeHtml(text)}">${escapeHtml(text)}</button></li>`,
      )
      .join('')
    dom.suggestions.hidden = suggestions.length === 0
  } catch (_error) {
    dom.suggestions.hidden = true
  }
}

function closeAccountMenu() {
  dom.accountMenu.hidden = true
  dom.account.setAttribute('aria-expanded', 'false')
}

function openAccountMenu() {
  const model = accountMenuModel(state.account)
  if (!model) return
  dom.accountMenu.innerHTML = renderAccountMenu(model)
  dom.accountMenu.hidden = false
  dom.account.setAttribute('aria-expanded', 'true')
}

function paintAccount(account) {
  const label = accountLabel(account)
  dom.account.dataset.loggedIn = account?.loggedIn ? 'true' : 'false'
  dom.account.title = account?.email || label
  dom.account.innerHTML = renderAccountButton(account)
  if (!account?.loggedIn) closeAccountMenu()
  else if (!dom.accountMenu.hidden) openAccountMenu()
}

async function refreshAccount() {
  try {
    const account = await api.authState()
    state.account = account
    paintAccount(account)
  } catch (_error) {
    state.account = null
    paintAccount(null)
  }
}

function paintLastFm(lastfm) {
  if (!dom.lastfm) return
  dom.lastfm.textContent = lastFmButtonLabel(lastfm)
  dom.lastfm.dataset.connected = lastfm?.connected ? 'true' : 'false'
  dom.lastfm.setAttribute('aria-pressed', lastfm?.connected ? 'true' : 'false')
}

async function refreshLastFm() {
  try {
    state.lastfm = await api.lastfmState()
  } catch (_error) {
    state.lastfm = { connected: false, username: '', pending: false, hasKeys: false }
  }
  paintLastFm(state.lastfm)
}

function pollLastFm() {
  clearInterval(state.lastfmTimer)
  let ticks = 0
  state.lastfmTimer = setInterval(async () => {
    ticks += 1
    if (ticks > 60) {
      clearInterval(state.lastfmTimer)
      return
    }
    try {
      const result = await api.lastfmComplete()
      state.lastfm = result
      paintLastFm(result)
      if (result.connected) clearInterval(state.lastfmTimer)
    } catch (_error) {
      // Last.fm error 14 (token not approved yet) keeps the poll alive.
    }
  }, 2000)
}

async function onLastFmClick() {
  const action = lastFmClickAction(state.lastfm)
  try {
    if (action === 'logout') {
      state.lastfm = await api.lastfmLogout()
    } else if (action === 'complete') {
      state.lastfm = await api.lastfmComplete()
      if (!state.lastfm.connected) {
        setStatus('Autorize o OurTube Music no Last.fm e clique de novo', 'info')
      }
    } else {
      state.lastfm = await api.lastfmLogin()
      pollLastFm()
    }
    paintLastFm(state.lastfm)
  } catch (error) {
    setStatus(error.message ?? 'falha no Last.fm', 'error')
  }
}

async function openLogin() {
  dom.loginStatus.textContent = 'Abrindo a janela do Google…'
  dom.loginDialog.showModal()
  try {
    await api.authBrowserLogin()
    dom.loginStatus.textContent =
      'Entre com sua conta na janela do Google. O app detecta sozinho quando terminar.'
    pollLogin()
  } catch (error) {
    dom.loginStatus.textContent = `Login indisponível: ${error.message}`
  }
}

// The sign-in happens in a real Google window; we only read the cookies it
// leaves behind (auth_check) and stop as soon as SAPISID is stored.
function pollLogin() {
  clearInterval(state.loginTimer)
  state.loginTimer = setInterval(async () => {
    try {
      const status = await api.authCheck()
      if (status === 'authorized') {
        clearInterval(state.loginTimer)
        dom.loginStatus.textContent = 'Autorizado!'
        await refreshAccount()
        await reloadMusic()
        setTimeout(() => dom.loginDialog.close(), 700)
        return
      }
      if (status === 'no_window') {
        clearInterval(state.loginTimer)
        dom.loginStatus.textContent = 'Janela fechada antes do login. Tente de novo.'
        return
      }
      dom.loginStatus.textContent = 'Aguardando você concluir o login no Google…'
    } catch (error) {
      clearInterval(state.loginTimer)
      dom.loginStatus.textContent = `Falha ao checar o login: ${error.message}`
    }
  }, 2000)
}

async function reloadMusic() {
  state.shelves = []
  state.homeLoaded = false
  if (isHomeRoute()) {
    renderHome()
    await loadHome()
  }
}

/* ── routing ────────────────────────────────────────────────────────────── */
function route() {
  dom.suggestions.hidden = true
  const hash = location.hash.replace(/^#/, '') || '/'
  const [path, queryString] = hash.split('?')
  const params = new URLSearchParams(queryString ?? '')
  if (path === '/search') {
    const query = params.get('q') ?? ''
    dom.input.value = query
    renderSearchChips()
    runSearch(query)
    return
  }
  if (path.startsWith('/watch/')) {
    watch(path.slice('/watch/'.length))
    return
  }
  if (path.startsWith('/browse/')) {
    loadBrowse(browseIdFromPath(path))
    return
  }
  dom.input.value = ''
  state.chips = state.homeChips
  if (state.chips.length) renderMoodChips()
  else dom.chips.innerHTML = ''
  if (path === '/favorites') {
    renderFavorites()
    return
  }
  renderHome()
  if (!state.homeLoaded) loadHome()
}

/* ── events ─────────────────────────────────────────────────────────────── */
function wireEvents() {
  dom.form.addEventListener('submit', (event) => {
    event.preventDefault()
    dom.suggestions.hidden = true
    location.hash = `#/search?q=${encodeURIComponent(dom.input.value.trim())}`
  })

  let suggestTimer
  dom.input.addEventListener('input', () => {
    clearTimeout(suggestTimer)
    const term = dom.input.value.trim()
    if (term.length < 2) {
      dom.suggestions.hidden = true
      return
    }
    suggestTimer = setTimeout(() => loadSuggestions(term), 250)
  })

  dom.suggestions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-term]')
    if (!button) return
    dom.input.value = button.dataset.term
    dom.form.requestSubmit()
  })

  dom.recent.addEventListener('click', (event) => {
    const button = event.target.closest('[data-term]')
    if (!button) return
    dom.input.value = button.dataset.term
    dom.form.requestSubmit()
  })

  dom.chips.addEventListener('click', (event) => {
    const libraryChip = event.target.closest('[data-chip-browse]')
    if (libraryChip?.dataset.chipBrowse) {
      location.hash = guideHref(libraryChip.dataset.chipBrowse)
      return
    }
    const mood = event.target.closest('[data-chip-params]')
    if (mood) {
      for (const item of dom.chips.querySelectorAll('.chip'))
        item.classList.toggle('is-active', item === mood)
      if (!isHomeRoute()) location.hash = '#/'
      loadHome({ params: mood.dataset.chipParams })
      return
    }
    const chip = event.target.closest('[data-filter]')
    if (!chip) return
    state.filter = chip.dataset.filter
    for (const item of dom.chips.querySelectorAll('.chip'))
      item.classList.toggle('is-active', item === chip)
    if (location.hash.startsWith('#/search')) {
      renderSearch(
        new URLSearchParams(location.hash.split('?')[1] ?? '').get('q') ?? '',
        state.results,
      )
    }
  })

  dom.main.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-home]')) {
      state.homeLoaded = false
      renderHome()
      loadHome()
      return
    }
    if (event.target.closest('[data-open-login]')) {
      openLogin()
      return
    }
    const row = event.target.closest('[data-browse-id], [data-video-id], [data-playlist-id]')
    if (!row) return
    const browseId = row.dataset.browseId
    if (isCatalogBrowseId(browseId)) {
      if (row.tagName !== 'A') location.hash = catalogHref({ browseId })
      return
    }
    const videoId = row.dataset.videoId
    const playlistId = row.dataset.playlistId
    if (isCatalogBrowseId(browseIdFromPath(location.hash)) && videoId) {
      if (row.hasAttribute('data-radio')) {
        playCatalogRadio(state.album?.feed?.header, videoId, playlistId)
        return
      }
      const queue = albumQueue(state.album?.feed)
      const track = queue.find((item) => item.videoId === videoId)
      if (track) {
        play(track, queue)
        return
      }
    }
    if (videoId) {
      const list = playlistId ? `?list=${encodeURIComponent(playlistId)}` : ''
      location.hash = `#/watch/${videoId}${list}`
      return
    }
    if (playlistId) playMix(playlistId)
  })

  dom.guide.addEventListener('click', (event) => {
    const link = event.target.closest('[data-browse]')
    if (!link) return
    const browseId = link.dataset.browse
    if (browseIdFromPath(location.hash) !== browseId) return
    event.preventDefault()
    if (browseId === HOME_BROWSE_ID) loadHome()
    else loadBrowse(browseId)
  })

  dom.favorites.addEventListener('click', () => {
    location.hash = '#/favorites'
  })

  dom.heart.addEventListener('click', toggleCurrentFavorite)

  dom.playPause.addEventListener('click', () => {
    if (dom.audio.paused) dom.audio.play().catch(() => setStatus('áudio indisponível', 'error'))
    else dom.audio.pause()
  })

  dom.next.addEventListener('click', () => step(1))
  dom.prev.addEventListener('click', () => step(-1))
  dom.repeat.addEventListener('click', cycleRepeat)
  dom.shuffle.addEventListener('click', toggleShuffle)
  paintTransport()
  dom.audio.addEventListener('ended', () => {
    if (state.repeat === 'one') {
      dom.audio.currentTime = 0
      dom.audio.play().catch(() => setStatus('áudio indisponível', 'error'))
      return
    }
    step(1)
  })
  dom.audio.addEventListener('play', refreshPlayPauseIcon)
  dom.audio.addEventListener('playing', refreshPlayPauseIcon)
  dom.audio.addEventListener('pause', refreshPlayPauseIcon)
  dom.audio.addEventListener('error', () => {
    if (!state.audioBase || state.variantFallback) {
      setStatus('áudio indisponível para esta faixa', 'error')
      return
    }
    state.variantFallback = true
    dom.audio.src = `${state.audioBase}?variant=webm`
    dom.audio.load()
    dom.audio.play().catch(() => setStatus('áudio indisponível para esta faixa', 'error'))
  })
  dom.audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(dom.audio.duration))
      dom.total.textContent = formatDuration(dom.audio.duration)
  })
  dom.audio.addEventListener('timeupdate', () => {
    const ratio = dom.audio.duration ? dom.audio.currentTime / dom.audio.duration : 0
    dom.progress.value = String(Math.round(ratio * 1000))
    dom.elapsed.textContent = formatDuration(dom.audio.currentTime)
    if (!state.current) return
    lastFm
      .onProgress(state.current, {
        durationSec: dom.audio.duration,
        playedSec: dom.audio.currentTime,
      })
      .catch(() => {})
    syncLyricsCursor()
  })
  dom.progress.addEventListener('input', () => {
    if (!dom.audio.duration) return
    dom.audio.currentTime = (Number(dom.progress.value) / 1000) * dom.audio.duration
  })
  dom.volume.addEventListener('input', () => {
    dom.audio.volume = Number(dom.volume.value) / 100
    try {
      localStorage.setItem('ourtube-volume', dom.volume.value)
    } catch (_error) {
      // volume persistence is best-effort
    }
  })

  dom.loginDialog.addEventListener('close', () => clearInterval(state.loginTimer))

  dom.lastfm?.addEventListener('click', () => {
    onLastFmClick()
  })
  dom.account.addEventListener('click', () => {
    if (state.account?.loggedIn) {
      if (dom.accountMenu.hidden) openAccountMenu()
      else closeAccountMenu()
      return
    }
    openLogin()
  })
  dom.accountMenu.addEventListener('click', (event) => {
    if (event.target.closest('.account-menu-manage')) {
      closeAccountMenu()
      return
    }
    const action = event.target.closest('[data-account-action]')?.dataset.accountAction
    if (!action) return
    event.preventDefault()
    closeAccountMenu()
    if (action === 'switch') openLogin()
    if (action === 'logout') dom.logoutDialog.showModal()
  })
  document.addEventListener('click', (event) => {
    if (!dom.accountSlot.contains(event.target)) closeAccountMenu()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    closeAccountMenu()
    if (state.nowPlayingOpen) setNowPlayingOpen(false)
    if (state.lyricsOpen) setLyricsOpen(false)
  })

  dom.expand.addEventListener('click', () => {
    if (!state.current) return
    setNowPlayingOpen(!state.nowPlayingOpen)
  })
  dom.openLyrics.addEventListener('click', () => {
    if (!state.current) return
    setLyricsOpen(!state.lyricsOpen)
  })
  dom.closeLyrics.addEventListener('click', () => setLyricsOpen(false))
  dom.shareLyrics.addEventListener('click', async () => {
    const text = shareLyricsText({
      title: state.current?.title,
      artist: state.current?.artist,
      lines: state.lyrics?.cues?.length ? state.lyrics.cues : state.lyrics?.lines,
    })
    try {
      await navigator.clipboard.writeText(text)
      setStatus('letra copiada')
    } catch (_error) {
      setStatus('não deu para copiar a letra', 'error')
    }
  })
  // Closing the dialog keeps the poll alive: Google can take a couple of
  // minutes and the token must still land when the user approves.
  dom.logoutConfirm.addEventListener('click', async () => {
    await api.authLogout()
    dom.logoutDialog.close()
    await refreshAccount()
    await reloadMusic()
  })

  dom.theme.addEventListener('click', () => {
    const light = document.documentElement.dataset.theme === 'light'
    document.documentElement.dataset.theme = light ? 'dark' : 'light'
    try {
      localStorage.setItem('ourtube-theme', light ? 'dark' : 'light')
    } catch (_error) {
      // Persistir o tema é best-effort; o toggle vale para esta sessão.
    }
  })

  window.addEventListener('hashchange', route)
}

async function boot() {
  try {
    state.recent = JSON.parse(localStorage.getItem('ourtube-recent') ?? '[]')
  } catch (_error) {
    state.recent = []
  }
  state.favorites = readFavorites(localStorage.getItem('ourtube-favorites'))

  const savedTheme = (() => {
    try {
      return localStorage.getItem('ourtube-theme')
    } catch (_error) {
      return null
    }
  })()
  document.documentElement.dataset.theme = savedTheme === 'light' ? 'light' : 'dark'

  const savedVolume = (() => {
    try {
      return localStorage.getItem('ourtube-volume')
    } catch (_error) {
      return null
    }
  })()
  if (savedVolume) dom.volume.value = savedVolume
  dom.audio.volume = Number(dom.volume.value) / 100

  renderRecent()
  wireEvents()
  route()

  api
    .guide()
    .then(renderGuide)
    .catch(() => renderGuide([{ label: 'Home', browseId: 'FEmusic_home' }]))
  await refreshAccount()
  await refreshLastFm()

  if (isHomeRoute() && !state.shelves.length) await loadHome()
}

boot()
