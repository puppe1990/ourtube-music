import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { readFileSync } from 'node:fs'

import {
  followingTrack,
  nextRepeatMode,
  nextTrack,
  repeatButtonLabel,
  shouldReplaceQueue,
  shuffleButtonLabel,
  shuffleQueue,
  upNext,
} from '../src/queue.mjs'

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

test('nextRepeatMode cycles off, all, one', () => {
  assert.equal(nextRepeatMode('off'), 'all')
  assert.equal(nextRepeatMode('all'), 'one')
  assert.equal(nextRepeatMode('one'), 'off')
  assert.equal(nextRepeatMode(undefined), 'all')
})

test('followingTrack stops at the end when repeat is off', () => {
  const tracks = [track(), track()]

  assert.equal(followingTrack(tracks, tracks[1].videoId, { repeat: 'off' }), null)
  assert.equal(
    followingTrack(tracks, tracks[0].videoId, { repeat: 'off' }).videoId,
    tracks[1].videoId,
  )
})

test('followingTrack wraps when repeat is all', () => {
  const tracks = [track(), track()]

  assert.equal(
    followingTrack(tracks, tracks[1].videoId, { repeat: 'all' }).videoId,
    tracks[0].videoId,
  )
})

test('shuffleQueue keeps the current track first and permutes the rest', () => {
  const tracks = [track(), track(), track(), track()]
  const shuffled = shuffleQueue(tracks, tracks[1].videoId, () => 0)

  assert.equal(shuffled[0].videoId, tracks[1].videoId)
  assert.deepEqual(
    [...shuffled.map((item) => item.videoId)].sort(),
    [...tracks.map((item) => item.videoId)].sort(),
  )
  assert.notDeepEqual(
    shuffled.slice(1).map((item) => item.videoId),
    tracks.filter((item) => item.videoId !== tracks[1].videoId).map((item) => item.videoId),
  )
})

test('repeat and shuffle labels name the current mode', () => {
  assert.equal(repeatButtonLabel('off'), 'Repetir')
  assert.equal(repeatButtonLabel('all'), 'Repetindo a fila')
  assert.equal(repeatButtonLabel('one'), 'Repetindo esta faixa')
  assert.equal(shuffleButtonLabel(false), 'Ordem aleatória')
  assert.equal(shuffleButtonLabel(true), 'Ordem aleatória ativada')
})

test('the dock keeps repeat left of previous and shuffle right of next', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')
  const repeatAt = html.indexOf('id="repeat"')
  const prevAt = html.indexOf('id="prev"')
  const nextAt = html.indexOf('id="next"')
  const shuffleAt = html.indexOf('id="shuffle"')

  assert.ok(repeatAt > 0, 'missing #repeat')
  assert.ok(shuffleAt > 0, 'missing #shuffle')
  assert.ok(repeatAt < prevAt && prevAt < nextAt && nextAt < shuffleAt)
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
