import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LRCLIB_USER_AGENT,
  fetchSyncedLyrics,
  lrclibSearchUrl,
  pickSyncedLyricsHit,
} from '../src/lrclib.mjs'

faker.seed(81)

function hit({ duration, synced } = {}) {
  return {
    id: faker.number.int({ min: 1, max: 99_999 }),
    trackName: faker.music.songName(),
    artistName: faker.music.artist(),
    duration: duration ?? faker.number.int({ min: 90, max: 400 }),
    syncedLyrics: synced === false ? '' : `[00:12.00] ${faker.lorem.sentence()}`,
    plainLyrics: faker.lorem.paragraph(),
  }
}

test('lrclibSearchUrl queries track and artist on the public search endpoint', () => {
  const track = faker.music.songName()
  const artist = faker.music.artist()
  const url = new URL(lrclibSearchUrl({ track, artist }))

  assert.equal(url.origin, 'https://lrclib.net')
  assert.equal(url.pathname, '/api/search')
  assert.equal(url.searchParams.get('track_name'), track)
  assert.equal(url.searchParams.get('artist_name'), artist)
})

test('LRCLIB_USER_AGENT names this app so the public API accepts the request', () => {
  assert.match(LRCLIB_USER_AGENT, /^OurTubeMusic\/0\.2\.0 /)
  assert.match(LRCLIB_USER_AGENT, /github\.com\/puppe1990\/ourtube-music/)
})

test('pickSyncedLyricsHit prefers the synced row whose duration is closest', () => {
  const durationSec = 214
  const closer = hit({ duration: 216 })
  const farther = hit({ duration: 180 })
  const unsynced = hit({ duration: 214, synced: false })

  assert.equal(pickSyncedLyricsHit([unsynced, farther, closer], durationSec), closer)
})

test('pickSyncedLyricsHit returns null when nobody shipped synced lyrics', () => {
  const durationSec = faker.number.int({ min: 60, max: 300 })

  assert.equal(
    pickSyncedLyricsHit([hit({ synced: false }), hit({ synced: false })], durationSec),
    null,
  )
  assert.equal(pickSyncedLyricsHit([], durationSec), null)
})

test('fetchSyncedLyrics searches then returns the closest synced payload', async () => {
  const track = faker.music.songName()
  const artist = faker.music.artist()
  const durationSec = 200
  const winner = hit({ duration: 201 })
  const other = hit({ duration: 140 })
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), ua: init.headers['user-agent'] })
    return { ok: true, json: async () => [other, winner] }
  }

  const lrc = await fetchSyncedLyrics({ track, artist, durationSec, fetch: fetchImpl })

  assert.equal(lrc, winner.syncedLyrics)
  assert.equal(calls[0].ua, LRCLIB_USER_AGENT)
  assert.equal(new URL(calls[0].url).searchParams.get('track_name'), track)
})

test('fetchSyncedLyrics is a no-op without a title and artist', async () => {
  let called = 0
  const fetchImpl = async () => {
    called += 1
    return { ok: true, json: async () => [] }
  }

  assert.equal(
    await fetchSyncedLyrics({ track: '', artist: faker.music.artist(), fetch: fetchImpl }),
    '',
  )
  assert.equal(called, 0)
})
