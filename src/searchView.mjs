import { catalogHref, isAlbumBrowseId } from './guide.mjs'
import { isOfflineSaved } from './offline.mjs'
import { offlineAlbumButton, offlineSaveButton } from './offlineView.mjs'
import { searchHref } from './searchFeed.mjs'

const ICON_PLAY =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7z"></path></svg>'
const ICON_SHUFFLE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20l6.5-6.5M21 8l-6.5 6.5M16 21h5v-5M15 15l6 6M4 4l5 5"></path></svg>'
const ICON_CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 6l6 6-6 6"></path></svg>'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function playAttrs(item) {
  const attrs = []
  if (item.browseId) attrs.push(`data-browse-id="${escapeHtml(item.browseId)}"`)
  if (item.videoId) attrs.push(`data-video-id="${escapeHtml(item.videoId)}"`)
  if (item.playlistId) attrs.push(`data-playlist-id="${escapeHtml(item.playlistId)}"`)
  return attrs.join(' ')
}

function art(item, className) {
  if (!item?.thumbnail) return `<div class="${className} art-empty"></div>`
  return `<img class="${className}" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" />`
}

function isCircle(item) {
  return item.resultType === 'artist' || item.resultType === 'profile'
}

function renderTabs(tabs, query) {
  if (!tabs.length) return ''
  const items = tabs
    .map((tab) => {
      const current = tab.selected ? ' aria-current="true"' : ''
      const params = tab.params ? ` data-search-params="${escapeHtml(tab.params)}"` : ''
      return `<a class="search-tab" href="${searchHref(query, tab.params)}"${current}${params}>${escapeHtml(tab.label)}</a>`
    })
    .join('')
  return `<nav class="search-tabs" aria-label="Escopo da busca">${items}</nav>`
}

function renderChips(chips, query) {
  if (!chips.length) return ''
  const items = chips
    .map((chip) => {
      const active = chip.selected ? ' is-active' : ''
      const params = chip.selected ? '' : chip.params
      return `<a class="chip${active}" href="${searchHref(query, params)}" data-search-params="${escapeHtml(chip.params)}">${escapeHtml(chip.label)}</a>`
    })
    .join('')
  return `<div class="search-chips" role="group" aria-label="Filtrar resultados">${items}</div>`
}

function topPlayButton(top, shuffle) {
  const playlistId = shuffle ? top.shufflePlaylistId || top.playlistId : top.playlistId
  const videoId = top.videoId
  if (!playlistId && !videoId) return ''
  const label = shuffle ? 'Aleatório' : 'Reproduzir'
  const icon = shuffle ? ICON_SHUFFLE : ICON_PLAY
  const kind = shuffle ? 'search-shuffle' : 'search-play'
  const shuffleAttr = shuffle ? ' data-shuffle="true"' : ''
  const listAttr = playlistId ? ` data-play-playlist="${escapeHtml(playlistId)}"` : ''
  const videoAttr = videoId ? ` data-video-id="${escapeHtml(videoId)}"` : ''
  return `<button class="${kind}" type="button"${listAttr}${videoAttr}${shuffleAttr}>${icon}<span>${label}</span></button>`
}

function renderTop(top) {
  if (!top) return ''
  const href = catalogHref(top)
  const more = href
    ? `<a class="search-top-more" href="${href}" aria-label="${escapeHtml(top.title)}">${ICON_CHEVRON}</a>`
    : ''
  return `<article class="search-top">
    <a class="search-top-main" href="${href || '#'}" ${playAttrs(top)}>
      ${art(top, 'search-top-art')}
      <span class="search-top-text">
        <strong>${escapeHtml(top.title)}</strong>
        <span>${escapeHtml(top.subtitle)}</span>
      </span>
    </a>
    <div class="search-top-actions">
      ${topPlayButton(top, false)}
      ${topPlayButton(top, true)}
      ${isAlbumBrowseId(top.browseId) ? offlineAlbumButton(top.browseId, 'none') : ''}
      ${more}
    </div>
  </article>`
}

function rowDownload(item, saved) {
  if (isAlbumBrowseId(item.browseId)) return offlineAlbumButton(item.browseId, 'none')
  if (item.videoId) return offlineSaveButton(item.videoId, isOfflineSaved(saved, item.videoId))
  return ''
}

function renderRow(item, saved) {
  const href = catalogHref(item)
  const tag = href ? 'a' : 'button'
  const extra = href ? `href="${href}"` : 'type="button"'
  const circle = isCircle(item) ? ' is-circle' : ''
  const download = rowDownload(item, saved)
  return `<li class="track-item">
    <${tag} class="search-row" ${extra} ${playAttrs(item)}>
      ${art(item, `search-row-art${circle}`)}
      <span class="search-row-text">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.subtitle)}</span>
      </span>
    </${tag}>
    ${download}
  </li>`
}

function renderItems(items, query, saved) {
  if (!items.length) {
    return `<p class="empty">Nada encontrado para “${escapeHtml(query)}”.</p>`
  }
  return `<ul class="search-list">${items.map((item) => renderRow(item, saved)).join('')}</ul>`
}

export function renderSearchPage(feed, query, saved = []) {
  const tabs = Array.isArray(feed?.tabs) ? feed.tabs : []
  const chips = Array.isArray(feed?.chips) ? feed.chips : []
  const items = Array.isArray(feed?.items) ? feed.items : []
  const empty = !feed?.top && items.length === 0
  return `<section class="search-page">
    ${renderTabs(tabs, query)}
    ${renderChips(chips, query)}
    ${renderTop(feed?.top)}
    ${empty ? renderItems([], query, saved) : renderItems(items, query, saved)}
  </section>`
}
