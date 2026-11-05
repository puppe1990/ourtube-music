import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { isFavorite, readFavorites, toggleFavorite } from '../src/favorites.mjs'

faker.seed(8)

function track() {
  return {
    videoId: faker.string.alphanumeric(11),
    title: faker.music.songName(),
    artist: faker.music.artist(),
    album: faker.music.album(),
    duration: '3:21',
    thumbnail: faker.image.url(),
  }
}

test('toggleFavorite adds a track and reports the new state', () => {
  const song = track()

  const added = toggleFavorite([], song)

  assert.deepEqual(added, [song])
  assert.equal(isFavorite(added, song.videoId), true)
})

test('toggleFavorite removes a track that is already saved', () => {
  const first = track()
  const second = track()

  const removed = toggleFavorite([first, second], first.videoId)

  assert.deepEqual(removed, [second])
  assert.equal(isFavorite(removed, first.videoId), false)
})

test('toggleFavorite puts the newest favorite first and ignores duplicates', () => {
  const older = track()
  const newer = track()

  const favorites = toggleFavorite(toggleFavorite([], older), newer)

  assert.deepEqual(
    favorites.map((item) => item.videoId),
    [newer.videoId, older.videoId],
  )
})

test('readFavorites tolerates missing or corrupted storage', () => {
  assert.deepEqual(readFavorites(null), [])
  assert.deepEqual(readFavorites('not json'), [])
  assert.deepEqual(readFavorites('{"a":1}'), [])

  const song = track()
  assert.deepEqual(readFavorites(JSON.stringify([song])), [song])
})
