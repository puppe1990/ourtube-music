import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  createLastFmScrobbler,
  lastFmButtonLabel,
  lastFmClickAction,
  lastFmMissingKeysError,
  nowPlayingPayload,
  shouldScrobble,
} from '../src/lastfm.mjs'

faker.seed(71)

function fakeTrack() {
  return {
    videoId: faker.string.alphanumeric(11),
    title: faker.music.songName(),
    artist: faker.person.fullName(),
    album: faker.commerce.productName(),
  }
}

test('tracks of 30 seconds or less never scrobble', () => {
  const short = faker.number.int({ min: 1, max: 30 })

  assert.equal(shouldScrobble({ durationSec: short, playedSec: short }), false)
  assert.equal(shouldScrobble({ durationSec: 30, playedSec: 30 }), false)
})

test('a track longer than 30 seconds scrobbles at half its duration', () => {
  const durationSec = faker.number.int({ min: 40, max: 200 })

  assert.equal(shouldScrobble({ durationSec, playedSec: durationSec / 2 - 0.05 }), false)
  assert.equal(shouldScrobble({ durationSec, playedSec: durationSec / 2 }), true)
})

test('long tracks scrobble at four minutes even before the halfway point', () => {
  assert.equal(shouldScrobble({ durationSec: 600, playedSec: 239 }), false)
  assert.equal(shouldScrobble({ durationSec: 600, playedSec: 240 }), true)
})

test('shouldScrobble rejects missing or negative times', () => {
  assert.equal(shouldScrobble({ durationSec: Number.NaN, playedSec: 40 }), false)
  assert.equal(shouldScrobble({ durationSec: 90, playedSec: Number.NaN }), false)
  assert.equal(shouldScrobble({ durationSec: 90, playedSec: -1 }), false)
})

test('lastFmButtonLabel names the Last.fm account or the next auth step', () => {
  const username = faker.internet.username()

  assert.equal(lastFmButtonLabel({ username }), `Last.fm · ${username}`)
  assert.equal(lastFmButtonLabel({ connected: true, username }), `Last.fm · ${username}`)
  assert.equal(lastFmButtonLabel({ pending: true }), 'Concluir Last.fm')
  assert.equal(lastFmButtonLabel({}), 'Conectar Last.fm')
  assert.equal(lastFmButtonLabel(null), 'Conectar Last.fm')
})

test('lastFmClickAction logs out when connected and completes a pending token', () => {
  assert.equal(
    lastFmClickAction({ connected: true, username: faker.internet.username() }),
    'logout',
  )
  assert.equal(lastFmClickAction({ pending: true }), 'complete')
  assert.equal(lastFmClickAction({}), 'login')
})

test('missing Last.fm keys point at the API account form', () => {
  assert.match(lastFmMissingKeysError(), /https:\/\/www\.last\.fm\/api\/account\/create/)
  assert.match(lastFmMissingKeysError(), /LASTFM_API_KEY/)
  assert.match(lastFmMissingKeysError(), /lastfm\.json/)
})

test('nowPlayingPayload maps the playing row onto the Last.fm write fields', () => {
  const track = fakeTrack()
  const durationSec = faker.number.int({ min: 80, max: 320 })

  assert.deepEqual(nowPlayingPayload(track, { durationSec }), {
    artist: track.artist,
    track: track.title,
    album: track.album,
    duration: durationSec,
  })
})

test('the scrobbler announces now playing and scrobbles once when the rule is met', async () => {
  const started = 1_700_000_000
  const calls = { now: [], scrobble: [] }
  const scrobbler = createLastFmScrobbler({
    nowPlaying: async (payload) => {
      calls.now.push(payload)
    },
    scrobble: async (payload) => {
      calls.scrobble.push(payload)
    },
    now: () => started,
  })
  const track = fakeTrack()

  await scrobbler.onPlay(track, 180)
  await scrobbler.onProgress(track, { durationSec: 180, playedSec: 89 })
  await scrobbler.onProgress(track, { durationSec: 180, playedSec: 90 })
  await scrobbler.onProgress(track, { durationSec: 180, playedSec: 140 })

  assert.equal(calls.now.length, 1)
  assert.equal(calls.now[0].artist, track.artist)
  assert.equal(calls.now[0].track, track.title)
  assert.equal(calls.now[0].duration, 180)
  assert.equal(calls.scrobble.length, 1)
  assert.equal(calls.scrobble[0].timestamp, started)
  assert.equal(calls.scrobble[0].duration, 180)
  assert.equal(calls.scrobble[0].track, track.title)
})

test('the scrobbler resets when the playing video changes', async () => {
  const calls = { now: [], scrobble: [] }
  const scrobbler = createLastFmScrobbler({
    nowPlaying: async (payload) => {
      calls.now.push(payload)
    },
    scrobble: async (payload) => {
      calls.scrobble.push(payload)
    },
    now: () => 1_700_000_100,
  })
  const first = fakeTrack()
  const second = fakeTrack()

  await scrobbler.onPlay(first, 120)
  await scrobbler.onProgress(first, { durationSec: 120, playedSec: 60 })
  await scrobbler.onPlay(second, 200)
  await scrobbler.onProgress(second, { durationSec: 200, playedSec: 100 })

  assert.equal(calls.now.length, 2)
  assert.equal(calls.scrobble.length, 2)
  assert.equal(calls.scrobble[0].track, first.title)
  assert.equal(calls.scrobble[1].track, second.title)
})

test('the scrobbler skips rows without an artist or title', async () => {
  const calls = { now: 0, scrobble: 0 }
  const scrobbler = createLastFmScrobbler({
    nowPlaying: async () => {
      calls.now += 1
    },
    scrobble: async () => {
      calls.scrobble += 1
    },
  })
  const blank = { ...fakeTrack(), title: '', artist: '' }

  await scrobbler.onPlay(blank, 180)
  await scrobbler.onProgress(blank, { durationSec: 180, playedSec: 180 })

  assert.equal(calls.now, 0)
  assert.equal(calls.scrobble, 0)
})

test('the rail keeps a Last.fm button next to the Google account', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')
  const markup = fileURLToPath(new URL('../web/index.html', import.meta.url))

  assert.match(html, /id="lastfm"/, `missing #lastfm in ${markup}`)
  assert.match(html, /id="lastfm"[^>]*>\s*Conectar Last\.fm/)
})

test('the webview last.fm module stays free of node:crypto', () => {
  const src = readFileSync(new URL('../src/lastfm.mjs', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8')

  assert.doesNotMatch(src, /node:crypto/)
  assert.doesNotMatch(app, /lastfmSign/)
})
