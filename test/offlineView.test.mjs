import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { renderDownloadsPage, offlineAlbumButton, offlineSaveButton } from '../src/offlineView.mjs'

faker.seed(20261111)

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeRe(value) {
  return escapeHtml(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function track(overrides = {}) {
  return {
    videoId: faker.string.alphanumeric(11),
    title: faker.music.songName(),
    artist: faker.music.artist(),
    album: faker.music.album(),
    duration: '4:02',
    thumbnail: faker.image.url(),
    browseId: '',
    playlistId: '',
    ...overrides,
  }
}

test('renderDownloadsPage shows the empty copy when nothing is saved', () => {
  const html = renderDownloadsPage({ tracks: [], playingId: '' })

  assert.match(html, /class="downloads-page"/)
  assert.match(html, /Nada baixado/)
})

test('renderDownloadsPage groups a saved album and lists leftover singles', () => {
  const browseId = `MPREb_${faker.string.alphanumeric(12)}`
  const album = faker.music.album()
  const a = track({ browseId, album })
  const b = track({ browseId, album })
  const single = track()

  const html = renderDownloadsPage({ tracks: [a, b, single], playingId: a.videoId })

  assert.match(html, new RegExp(escapeRe(album)))
  assert.match(html, /2 faixas/)
  assert.match(html, new RegExp(`data-offline-album="${browseId}"`))
  assert.match(html, /class="track-row downloads-row"/)
  assert.match(html, new RegExp(escapeRe(single.title)))
  assert.match(html, new RegExp(`data-video-id="${a.videoId}"`))
})

test('offlineSaveButton marks the saved state and never nests a play handler', () => {
  const videoId = faker.string.alphanumeric(11)
  const idle = offlineSaveButton(videoId, false)
  const saved = offlineSaveButton(videoId, true)

  assert.match(idle, new RegExp(`data-offline-save="${videoId}"`))
  assert.match(idle, /aria-label="Baixar"/)
  assert.doesNotMatch(idle, /data-video-id=/)
  assert.match(saved, /data-saved="true"/)
  assert.match(saved, /aria-label="Remover download"/)
})

test('offlineAlbumButton uses the album state labels', () => {
  const browseId = `MPREb_${faker.string.alphanumeric(12)}`
  const html = offlineAlbumButton(browseId, 'partial')

  assert.match(html, new RegExp(`data-offline-album="${browseId}"`))
  assert.match(html, /Baixar restante/)
})
