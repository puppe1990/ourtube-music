import { createMusicApi, resolveInvoker } from '/src/api.mjs'
import { formatBitrate, formatDuration, shorten } from '/src/format.mjs'
import { nextTrack, upNext } from '/src/queue.mjs'

const api = createMusicApi(resolveInvoker())
const state = { shelves: [], results: [], queue: [], current: null, recent: [] }

const dom = {
  main: document.querySelector('#main'),
  guide: document.querySelector('#guide'),
  form: document.querySelector('#search'),
  input: document.querySelector('#search-input'),
  suggestions: document.querySelector('#suggestions'),
  account: document.querySelector('#account'),
  theme: document.querySelector('#theme-toggle'),
  recent: document.querySelector('#recent'),
  player: document.querySelector('#player'),
  audio: document.querySelector('#audio'),
  art: document.querySelector('#player-art'),
  title: document.querySelector('#player-title'),
  artist: document.querySelector('#player-artist'),
  meta: document.querySelector('#player-meta'),
  playPause: document.querySelector('#play-pause'),
  iconPlay: document.querySelector('#icon-play'),
  iconPause: document.querySelector('#icon-pause'),
  next: document.querySelector('#next'),
  progress: document.querySelector('#progress'),
  elapsed: document.querySelector('#elapsed'),
  total: document.querySelector('#total'),
  status: document.querySelector('#status'),
}

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

function art(track, size = 168) {
  if (!track?.thumbnail) return '<div class="art-fallback"></div>'
  return `<img src="${escapeHtml(track.thumbnail)}" alt="" width="${size}" height="${size}" loading="lazy" />`
}

function cardHtml(track) {
  return `<button class="card" type="button" data-video-id="${escapeHtml(track.videoId)}">
    ${art(track)}
    <strong>${escapeHtml(shorten(track.title, 40))}</strong>
    <span>${escapeHtml(shorten(track.artist, 34))}</span>
  </button>`
}

function rowHtml(track, index) {
  const current = state.current?.videoId === track.videoId ? 'true' : 'false'
  return `<li>
    <button class="track-row" type="button" data-video-id="${escapeHtml(track.videoId)}" data-current="${current}">
      <span class="track-index">${index + 1}</span>
      ${art(track, 46)}
      <span class="track-text">
        <strong>${escapeHtml(track.title)}</strong>
        <span>${escapeHtml([track.artist, track.album].filter(Boolean).join(' • '))}</span>
      </span>
      <span class="track-duration">${escapeHtml(track.duration)}</span>
    </button>
  </li>`
}

function trackListHtml(tracks) {
  if (!tracks.length) return '<p class="empty">Nenhuma faixa por aqui.</p>'
  return `<ul class="track-list">${tracks.map(rowHtml).join('')}</ul>`
}

function shelvesHtml(shelves) {
  return shelves
    .map(
      (shelf) => `<section class="shelf">
        <h2 class="section-title">${escapeHtml(shelf.title)}</h2>
        <div class="shelf-rail">${shelf.tracks.map(cardHtml).join('')}</div>
      </section>`,
    )
    .join('')
}

function renderHome() {
  if (!state.shelves.length) {
    dom.main.innerHTML = '<p class="empty">Carregando a home do YouTube Music…</p>'
    return
  }
  dom.main.innerHTML = shelvesHtml(state.shelves)
}

function renderSearch(query, tracks) {
  const heading = `<h2 class="section-title">Resultados para “${escapeHtml(query)}”</h2>`
  dom.main.innerHTML = `${heading}${tracks.length ? trackListHtml(tracks) : '<p class="empty">Nada encontrado.</p>'}`
}

function renderWatch(track) {
  const queued = upNext(state.queue, track.videoId)
  dom.main.innerHTML = `
    <section class="hero">
      ${art(track, 190)}
      <div class="hero-text">
        <h1>${escapeHtml(track.title || 'Tocando agora')}</h1>
        <p>${escapeHtml([track.artist, track.album].filter(Boolean).join(' • '))}</p>
        <div class="hero-meta">
          ${track.duration ? `<span class="chip">${escapeHtml(track.duration)}</span>` : ''}
          <span class="chip">player · IOS</span>
        </div>
      </div>
    </section>
    <section class="shelf">
      <h2 class="section-title">A seguir</h2>
      ${queued.length ? trackListHtml(queued) : '<p class="empty">Sem próximas faixas nesta fila.</p>'}
    </section>`
}

function renderGuide(entries) {
  dom.guide.innerHTML = entries
    .map(
      (entry) =>
        `<a href="#/" data-browse="${escapeHtml(entry.browseId)}" ${entry.browseId === 'FEmusic_home' ? 'aria-current="true"' : ''}>${escapeHtml(entry.label)}</a>`,
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

function findTrack(videoId) {
  const pools = [state.queue, state.results, ...state.shelves.map((shelf) => shelf.tracks)]
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
    dom.meta.textContent = [
      formatBitrate(stream.bitrate),
      stream.mimeType.includes('mp4') ? 'AAC' : 'Opus',
    ]
      .filter(Boolean)
      .join(' · ')
    dom.total.textContent = formatDuration(stream.duration)
    setStatus('')
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

// The watch-next panel also carries the current row (with its cover), so a
// deep link gets artwork and the "a seguir" list from a single call.
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

function isHomeRoute() {
  const hash = location.hash.replace(/^#/, '') || '/'
  return hash === '/' || hash === ''
}

// A deep link to /watch or /search boots while this fetch is in flight; only
// paint the home when the user is still there.
async function loadHome() {
  try {
    state.shelves = await api.home()
    if (isHomeRoute()) renderHome()
  } catch (error) {
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

function playNext() {
  const following = nextTrack(state.queue, state.current?.videoId)
  if (!following) {
    setStatus('fim da fila', 'info')
    return
  }
  location.hash = `#/watch/${following.videoId}`
}

function route() {
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
  renderHome()
}

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

  dom.main.addEventListener('click', (event) => {
    const row = event.target.closest('[data-video-id]')
    if (!row) return
    location.hash = `#/watch/${row.dataset.videoId}`
  })

  dom.playPause.addEventListener('click', () => {
    if (dom.audio.paused) dom.audio.play().catch(() => setStatus('áudio indisponível', 'error'))
    else dom.audio.pause()
  })

  dom.next.addEventListener('click', playNext)
  dom.audio.addEventListener('ended', playNext)

  // Some tracks only decode as Opus/WebM; retry once with the other container
  // before telling the listener the track is unavailable.
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
  dom.audio.addEventListener('play', () => {
    dom.iconPlay.hidden = true
    dom.iconPause.hidden = false
  })
  dom.audio.addEventListener('pause', () => {
    dom.iconPlay.hidden = false
    dom.iconPause.hidden = true
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
  renderRecent()
  wireEvents()
  route()

  api
    .guide()
    .then(renderGuide)
    .catch(() => renderGuide([{ label: 'Home', browseId: 'FEmusic_home' }]))
  api
    .account()
    .then((account) => {
      dom.account.textContent = account?.displayName || 'visitante'
    })
    .catch(() => {})

  if (!state.shelves.length) await loadHome()
}

boot()
