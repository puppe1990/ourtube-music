import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { nextTrack, shouldReplaceQueue, upNext } from '../src/queue.mjs'

faker.seed(7)

function track() {
  return {
    videoId: faker.string.alphanumeric(11),
    title: faker.music.songName(),
    artist: faker.music.artist(),
    album: faker.music.album(),
    duration: '3:33',
    thumbnail: faker.image.url(),
  }
}

test('nextTrack returns the following track', () => {
  const tracks = [track(), track(), track()]

  const following = nextTrack(tracks, tracks[0].videoId)

  assert.equal(following.videoId, tracks[1].videoId)
})

test('nextTrack wraps to the first track after the last one', () => {
  const tracks = [track(), track()]

  const following = nextTrack(tracks, tracks[1].videoId)

  assert.equal(following.videoId, tracks[0].videoId)
})

test('nextTrack falls back to the first track when the current one is unknown', () => {
  const tracks = [track(), track()]

  const following = nextTrack(tracks, faker.string.uuid())

  assert.equal(following.videoId, tracks[0].videoId)
})

test('nextTrack returns null for an empty queue', () => {
  assert.equal(nextTrack([], faker.string.alphanumeric(11)), null)
})

test('upNext lists the tracks after the current one, without duplicates', () => {
  const first = track()
  const repeated = { ...first }
  const second = track()
  const third = track()
  const tracks = [first, second, repeated, third]

  const queued = upNext(tracks, first.videoId)

  assert.deepEqual(
    queued.map((item) => item.videoId),
    [second.videoId, third.videoId],
  )
})

test('shouldReplaceQueue keeps an album queue when next has no playlist', () => {
  const current = track()
  const rest = [track(), track()]
  const incoming = [current]

  assert.equal(
    shouldReplaceQueue([current, ...rest], incoming, { videoId: current.videoId, playlistId: '' }),
    false,
  )
})

test('shouldReplaceQueue takes Innertube next when the hash has a playlist', () => {
  const current = track()
  const incoming = [current, track(), track()]
  const playlistId = `OLAK5uy_${faker.string.alphanumeric(12)}`

  assert.equal(
    shouldReplaceQueue([current], incoming, { videoId: current.videoId, playlistId }),
    true,
  )
})

test('shouldReplaceQueue fills an empty or single-track queue from next', () => {
  const current = track()
  const incoming = [current, track()]

  assert.equal(shouldReplaceQueue([], incoming, { videoId: current.videoId, playlistId: '' }), true)
  assert.equal(
    shouldReplaceQueue([current], incoming, { videoId: current.videoId, playlistId: '' }),
    true,
  )
  assert.equal(
    shouldReplaceQueue([current], [], { videoId: current.videoId, playlistId: '' }),
    false,
  )
})
