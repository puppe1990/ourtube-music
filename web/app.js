import { createMusicApi, resolveInvoker } from '/src/api.mjs'
import { isFavorite, readFavorites, toggleFavorite } from '/src/favorites.mjs'
import { formatBitrate, formatDuration, shorten } from '/src/format.mjs'
import { greeting } from '/src/greeting.mjs'
import { nextTrack, upNext } from '/src/queue.mjs'
import { accountLabel } from '/src/session.mjs'

const api = createMusicApi(resolveInvoker())
const state = {
  shelves: [],
  results: [],
  queue: [],
  current: null,
  recent: [],
  favorites: [],
  filter: '',
  homeLoaded: false,
}

const $ = (selector) => document.querySelector(selector)

const dom = {
  main: $('#main'),
  guide: $('#guide'),
  form: $('#search'),
  input: $('#search-input'),
  suggestions: $('#suggestions'),
  chips: $('#chips'),
  account: $('#account'),
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

/* ── cards / lists ──────────────────────────────────────────────────────── */
function quickCard(track) {
  return `<button class="quick-card" type="button" data-video-id="${escapeHtml(track.videoId)}">
    ${art(track, 'quick-art')}
    <span class="quick-text">
      <strong>${escapeHtml(shorten(track.title, 34))}</strong>
      <span>${escapeHtml(shorten(byline(track), 40))}</span>
    </span>
    <span class="quick-play" aria-hidden="true">${ICON_PLAY}</span>
  </button>`
}

function shelfCard(track) {
  return `<button class="card" type="button" data-video-id="${escapeHtml(track.videoId)}">
    <span class="card-art">
      ${art(track, 'card-img')}
      <span class="card-play" aria-hidden="true">${ICON_PLAY}</span>
    </span>
    <strong>${escapeHtml(shorten(track.title, 46))}</strong>
    <span>${escapeHtml(shorten(track.artist, 34))}</span>
  </button>`
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

function trackList(tracks, emptyMessage = 'Nenhuma faixa por aqui.') {
  if (!tracks.length) return `<p class="empty">${escapeHtml(emptyMessage)}</p>`
  return `<ul class="track-list">${tracks.map(row).join('')}</ul>`
}

/* ── views ──────────────────────────────────────────────────────────────── */
function quickPicks() {
  return state.shelves.flatMap((shelf) => shelf.tracks).slice(0, 6)
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
          <span class="pill pill-red">player · IOS</span>
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
  dom.guide.innerHTML = entries
    .map(
      (entry) =>
        `<a href="#/" data-browse="${escapeHtml(entry.browseId)}" ${
          entry.browseId === 'FEmusic_home' ? 'aria-current="true"' : ''
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
function findTrack(videoId) {
  const pools = [state.queue, state.results, state.favorites, ...state.shelves.map((s) => s.tracks)]
  return pools.flat().find((track) => track.videoId === videoId) ?? null
}

async function play(track, queue) {
  state.current = track
  state.queue = queue?.length ? queue : [track]
  renderWatch(track)
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
    state.containerFallback = false
    dom.audio.src = audioSrc
    dom.audio.load()
    await dom.audio.play().catch(() => setStatus('clique no play', 'info'))

    const queuedRow = state.queue.find((item) => item.videoId === track.videoId)
    const enriched = {
      ...track,
      title: track.title && track.title !== 'Carregando…' ? track.title : stream.title,
      artist: track.artist || stream.author,
      duration: track.duration || formatDuration(stream.duration),
      thumbnail: track.thumbnail || queuedRow?.thumbnail || '',
    }
    state.current = enriched
    if (location.hash.startsWith('#/watch/')) renderWatch(enriched)
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

function watch(videoId) {
  if (state.current?.videoId === videoId && dom.audio.src) {
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
  loadQueue(videoId)
}

async function loadQueue(videoId) {
  try {
    const queue = await api.queue(videoId)
    if (location.hash !== `#/watch/${videoId}` || queue.length === 0) return
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

async function loadHome() {
  try {
    state.shelves = await api.home()
    state.homeLoaded = true
    if (isHomeRoute()) renderHome()
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

async function refreshAccount() {
  try {
    const account = await api.authState()
    state.account = account
    dom.account.textContent = accountLabel(account)
    dom.account.dataset.loggedIn = account?.loggedIn ? 'true' : 'false'
  } catch (_error) {
    dom.account.textContent = accountLabel(null)
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
    runSearch(query)
    return
  }
  if (path.startsWith('/watch/')) {
    watch(path.slice('/watch/'.length))
    return
  }
  dom.input.value = ''
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
    const row = event.target.closest('[data-video-id]')
    if (!row) return
    location.hash = `#/watch/${row.dataset.videoId}`
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
  dom.audio.addEventListener('play', () => {
    dom.iconPlay.hidden = true
    dom.iconPause.hidden = false
  })
  dom.audio.addEventListener('pause', () => {
    dom.iconPlay.hidden = false
    dom.iconPause.hidden = true
  })
  dom.audio.addEventListener('error', () => {
    if (!state.audioBase || state.containerFallback) {
      setStatus('áudio indisponível para esta faixa', 'error')
      return
    }
    state.containerFallback = true
    dom.audio.src = `${state.audioBase}?container=webm`
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
    if (state.account?.loggedIn) dom.logoutDialog.showModal()
    else openLogin()
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

  if (!state.shelves.length) await loadHome()
}

boot()
