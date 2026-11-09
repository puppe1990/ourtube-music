import { groupOfflineLibrary, offlineAlbumLabel, offlineButtonLabel } from './offline.mjs'

const ICON_PLAY =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7z"></path></svg>'
const ICON_DOWNLOAD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"></path><path d="M7 11l5 5 5-5"></path><path d="M5 20h14"></path></svg>'
const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-9"></path></svg>'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function art(item, className) {
  if (!item?.thumbnail) return `<div class="${className} art-empty"></div>`
  return `<img class="${className}" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" />`
}

export function offlineSaveButton(videoId, saved) {
  const id = String(videoId ?? '')
  if (!id) return ''
  const label = offlineButtonLabel(saved)
  const icon = saved ? ICON_CHECK : ICON_DOWNLOAD
  const pressed = saved ? 'true' : 'false'
  return `<button class="offline-btn" type="button" data-offline-save="${escapeHtml(id)}" data-saved="${pressed}" aria-pressed="${pressed}" aria-label="${label}">${icon}</button>`
}

export function offlineAlbumButton(browseId, state) {
  const id = String(browseId ?? '')
  if (!id) return ''
  const label = offlineAlbumLabel(state)
  const saved = state === 'all'
  return `<button class="album-download" type="button" data-offline-album="${escapeHtml(id)}" data-saved="${saved}" aria-pressed="${saved}">${ICON_DOWNLOAD}<span>${escapeHtml(label)}</span></button>`
}

function albumCard(album, playingId) {
  const count = album.tracks.length
  const countLabel = count === 1 ? '1 faixa' : `${count} faixas`
  const first = album.tracks[0]
  const playId = first?.videoId ?? ''
  const play =
    playId &&
    `<button class="downloads-play" type="button" data-video-id="${escapeHtml(playId)}" data-offline-queue="${escapeHtml(album.browseId)}" aria-label="Tocar ${escapeHtml(album.title)}">${ICON_PLAY}</button>`
  const rows = album.tracks.map((track) => trackRow(track, playingId, true)).join('')
  return `<article class="downloads-album">
    <header class="downloads-album-head">
      ${art(album, 'downloads-album-art')}
      <div class="downloads-album-copy">
        <h2>${escapeHtml(album.title)}</h2>
        <p>${escapeHtml(album.artist)} · ${escapeHtml(countLabel)}</p>
      </div>
      ${play}
      ${offlineAlbumButton(album.browseId, 'all')}
    </header>
    <ul class="track-list">${rows}</ul>
  </article>`
}

function trackRow(track, playingId, saved) {
  const current = playingId && playingId === track.videoId
  return `<li class="track-item">
    <button class="track-row downloads-row" type="button" data-video-id="${escapeHtml(track.videoId)}" data-current="${current}">
      ${art(track, 'track-img')}
      <span class="track-text">
        <strong>${escapeHtml(track.title)}</strong>
        <span>${escapeHtml(track.artist)}</span>
      </span>
      <span class="track-duration">${escapeHtml(track.duration)}</span>
    </button>
    ${offlineSaveButton(track.videoId, saved)}
  </li>`
}

export function renderDownloadsPage({ tracks, playingId }) {
  const library = groupOfflineLibrary(tracks)
  if (!library.albums.length && !library.singles.length) {
    return `<section class="downloads-page">
      <h1>Downloads</h1>
      <p class="empty">Nada baixado. Toque no download numa faixa ou num álbum.</p>
    </section>`
  }
  const albums = library.albums.map((album) => albumCard(album, playingId)).join('')
  const singles = library.singles.length
    ? `<section class="downloads-singles">
        <h2 class="section-title">Faixas</h2>
        <ul class="track-list">${library.singles.map((track) => trackRow(track, playingId, true)).join('')}</ul>
      </section>`
    : ''
  return `<section class="downloads-page">
    <h1>Downloads</h1>
    ${albums}
    ${singles}
  </section>`
}
