import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  albumOfflineState,
  albumTracksFromFeed,
  groupOfflineLibrary,
  isOfflineSaved,
  offlineAlbumLabel,
  offlineButtonLabel,
} from '../src/offline.mjs'

faker.seed(20261109)

function track(overrides = {}) {
  return {
    videoId: faker.string.alphanumeric(11),
    title: faker.music.songName(),
    artist: faker.music.artist(),
    album: faker.music.album(),
    duration: '3:21',
    thumbnail: faker.image.url(),
    browseId: '',
    playlistId: '',
    ...overrides,
  }
}

test('isOfflineSaved matches by videoId', () => {
  const saved = track()
  const other = track()

  assert.equal(isOfflineSaved([saved], saved.videoId), true)
  assert.equal(isOfflineSaved([saved], other.videoId), false)
  assert.equal(isOfflineSaved([], saved.videoId), false)
})

test('groupOfflineLibrary clusters two-plus tracks that share an album browseId', () => {
  const browseId = `MPREb_${faker.string.alphanumeric(12)}`
  const album = faker.music.album()
  const artist = faker.music.artist()
  const a = track({ browseId, album, artist })
  const b = track({ browseId, album, artist })
  const single = track()
  const loneAlbum = track({ browseId: `MPREb_${faker.string.alphanumeric(12)}` })

  const grouped = groupOfflineLibrary([a, b, single, loneAlbum])

  assert.equal(grouped.albums.length, 1)
  assert.equal(grouped.albums[0].browseId, browseId)
  assert.equal(grouped.albums[0].title, album)
  assert.equal(grouped.albums[0].tracks.length, 2)
  assert.equal(grouped.singles.length, 2)
})

test('albumOfflineState compares the album tracklist to the saved library', () => {
  const first = track()
  const second = track()
  const album = [first, second]

  assert.equal(albumOfflineState([], album), 'none')
  assert.equal(albumOfflineState([first], album), 'partial')
  assert.equal(albumOfflineState([first, second], album), 'all')
  assert.equal(albumOfflineState([first], []), 'none')
})

test('albumTracksFromFeed keeps playable rows from the first shelf', () => {
  const playable = track()
  const skip = track({ videoId: '' })

  const rows = albumTracksFromFeed({
    shelves: [{ title: faker.music.genre(), tracks: [playable, skip] }],
  })

  assert.deepEqual(
    rows.map((row) => row.videoId),
    [playable.videoId],
  )
  assert.deepEqual(albumTracksFromFeed({}), [])
})

test('button labels follow the saved state', () => {
  assert.equal(offlineButtonLabel(false), 'Baixar')
  assert.equal(offlineButtonLabel(true), 'Remover download')
  assert.equal(offlineAlbumLabel('none'), 'Baixar')
  assert.equal(offlineAlbumLabel('partial'), 'Baixar restante')
  assert.equal(offlineAlbumLabel('all'), 'Remover download')
})
