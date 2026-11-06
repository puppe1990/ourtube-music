import { createMusicApi, resolveInvoker } from '/src/api.mjs'
import { isFavorite, readFavorites, toggleFavorite } from '/src/favorites.mjs'
import { formatBitrate, formatDuration, shorten } from '/src/format.mjs'
import { greeting } from '/src/greeting.mjs'
import {
  HOME_BROWSE_ID,
  LIBRARY_BROWSE_ID,
  browseIdFromPath,
  catalogHref,
  feedHeading,
  guideHref,
  isAlbumBrowseId,
} from '/src/guide.mjs'
import { playPauseAriaLabel, syncPlayPauseIcons } from '/src/playback.mjs'
import { nextTrack, upNext } from '/src/queue.mjs'
import { accountMenuModel, renderAccountButton, renderAccountMenu } from '/src/accountMenu.mjs'
import { accountLabel } from '/src/session.mjs'

const api = createMusicApi(resolveInvoker())
const state = {
  shelves: [],
  chips: [],
  results: [],
  queue: [],
  current: null,
  recent: [],
  favorites: [],
  filter: '',
  homeLoaded: false,
  guide: [],
  album: null,
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
  prev: $('#prev'),
  next: $('#next'),
  progress: $('#progress'),
  elapsed: $('#elapsed'),
  total: $('#total'),
  volume: $('#volume'),
  status: $('#status'),
  loginDialog: $('#login-dialog'),

  loginStatus: $('#login-status'),
  logoutDialog: $('#logout-dialog'),
  logoutConfirm: $('#logout-confirm'),
}

const ICON_PLAY =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7z"></path></svg>'

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
  return catalogTag(
    track,
    'card',
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
      : '<p class="empty">Carregando a home do YouTube Music…</p>'
    return
  }
  const picks = quickPicks()
  const shelves = state.shelves
    .map(
      (shelf) => `<section class="shelf">
        <div class="shelf-head">
          <div>
            <h2 class="section-title">${escapeHtml(shelf.title)}</h2>
            <p class="shelf-sub">${shelf.tracks.length} faixas</p>
          </div>
        </div>
        <div class="shelf-rail">${shelf.tracks.map(shelfCard).join('')}</div>
      </section>`,
    )
    .join('')

  dom.main.innerHTML = `
    <section class="hero">
      <span class="pulse-dot" aria-hidden="true"></span>
      <h1>${greeting(new Date().getHours())}</h1>
    </section>
    <section class="quick-grid">${picks.map(quickCard).join('')}</section>
    ${shelves}`
}

function renderSearch(query, tracks) {
  const visible = tracks.filter((track) => matchesFilter(track))
  const label = state.filter === 'song' ? 'Músicas' : state.filter === 'video' ? 'Vídeos' : 'Tudo'
  dom.main.innerHTML = `
    <section class="hero">
      <span class="pulse-dot" aria-hidden="true"></span>
      <h1>Resultados</h1>
    </section>
    <section class="shelf">
      <div class="shelf-head">
        <div>
          <h2 class="section-title">“${escapeHtml(query)}”</h2>
          <p class="shelf-sub">${visible.length} itens · filtro: ${label}</p>
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
        <div class="hero-meta">
          ${track.duration ? `<span class="pill">${escapeHtml(track.duration)}</span>` : ''}
          <span class="pill pill-red">player · ANDROID</span>
        </div>
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
      <span class="pulse-dot" aria-hidden="true"></span>
      <h1>Músicas Curtidas</h1>
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
  if (state.album && isAlbumBrowseId(browseIdFromPath(location.hash))) {
    renderAlbumPage(state.album.browseId, state.album.feed)
  }
}

async function play(track, queue) {
  state.current = track
  state.queue = queue?.length ? queue : [track]
  refreshNowPlayingView()
  dom.player.hidden = false
  dom.title.textContent = track.title || '—'
  dom.artist.textContent = track.artist || '—'
  dom.art.src = track.thumbnail || ''
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
    const enriched = {
      ...track,
      title: track.title && track.title !== 'Carregando…' ? track.title : stream.title,
      artist: track.artist || stream.author,
      duration: track.duration || formatDuration(stream.duration),
      thumbnail: track.thumbnail || queuedRow?.thumbnail || '',
    }
    state.current = enriched
    refreshNowPlayingView()
    dom.title.textContent = enriched.title
    dom.artist.textContent = enriched.artist
    dom.art.src = enriched.thumbnail || ''
    dom.meta.textContent = [
      formatBitrate(stream.bitrate),
      stream.mimeType.includes('mp4') ? 'AAC' : 'Opus',
    ]
      .filter(Boolean)
      .join(' · ')
    dom.total.textContent = formatDuration(stream.duration)
    setStatus('')
    refreshHeart()
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

function step(direction) {
  const index = state.queue.findIndex((track) => track.videoId === state.current?.videoId)
  if (index < 0) return
  const following =
    direction > 0
      ? nextTrack(state.queue, state.current.videoId)
      : (state.queue[index - 1] ?? state.queue.at(-1))
  if (!following) return
  location.hash = `#/watch/${following.videoId}`
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

function browseEmpty(browseId, message) {
  const login =
    browseId === LIBRARY_BROWSE_ID
      ? ' <button type="button" class="link-button" data-open-login>Fazer login</button>'
      : ''
  return `<p class="empty">${escapeHtml(message || 'Nada por aqui agora.')}${login}</p>`
}

function relatedShelvesHtml(shelves) {
  return (shelves ?? [])
    .map(
      (shelf) => `<section class="shelf">
        <div class="shelf-head">
          <div>
            <h2 class="section-title">${escapeHtml(shelf.title)}</h2>
            <p class="shelf-sub">${shelf.tracks.length} faixas</p>
          </div>
        </div>
        <div class="shelf-rail">${shelf.tracks.map(shelfCard).join('')}</div>
      </section>`,
    )
    .join('')
}

function renderBrowsePage(browseId, feed) {
  const title = feedHeading(browseId)
  const shelves = relatedShelvesHtml(feed.shelves)
  dom.main.innerHTML = `
    <section class="hero">
      <span class="pulse-dot" aria-hidden="true"></span>
      <h1>${escapeHtml(title)}</h1>
    </section>
    ${shelves || browseEmpty(browseId, feed.message)}`
}

function renderAlbumPage(browseId, feed) {
  state.album = { browseId, feed }
  const header = feed.header
  const [tracklist, ...related] = feed.shelves ?? []
  const tracks = tracklist?.tracks ?? []
  const playTrack = albumPlayTarget(feed)
  const artistThumb = header.artistThumbnail
    ? `<img class="album-artist-img" src="${escapeHtml(header.artistThumbnail)}" alt="" />`
    : ''
  const playButton = playTrack
    ? `<button class="album-play" type="button" ${playAttrs(playTrack)} aria-label="Tocar álbum">${ICON_PLAY}</button>`
    : ''
  const list = tracks.length
    ? `<ol class="track-list album-tracks">${tracks.map(albumRow).join('')}</ol>`
    : `<p class="empty">Este álbum veio sem faixas.</p>`
  dom.main.innerHTML = `
    <section class="album-spread">
      <div class="album-hero">
        <p class="album-artist">${artistThumb}<span>${escapeHtml(header.artist)}</span></p>
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

async function loadBrowse(browseId) {
  renderGuide()
  dom.chips.innerHTML = ''
  const label = isAlbumBrowseId(browseId) ? 'álbum' : feedHeading(browseId)
  dom.main.innerHTML = `<p class="empty">Carregando ${escapeHtml(label)}…</p>`
  try {
    const feed = readHomeFeed(await api.browse(browseId))
    if (browseIdFromPath(location.hash) !== browseId) return
    if (feed.header) renderAlbumPage(browseId, feed)
    else {
      state.album = null
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
  if (state.chips.length) renderMoodChips()
  if (path === '/favorites') {
    renderFavorites()
    return
  }
  renderHome()
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
    if (isAlbumBrowseId(browseId)) {
      if (row.tagName !== 'A') location.hash = catalogHref({ browseId })
      return
    }
    const videoId = row.dataset.videoId
    const playlistId = row.dataset.playlistId
    if (isAlbumBrowseId(browseIdFromPath(location.hash)) && videoId) {
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
  dom.audio.addEventListener('ended', () => step(1))
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
    if (event.key === 'Escape') closeAccountMenu()
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

  if (isHomeRoute() && !state.shelves.length) await loadHome()
}

boot()
