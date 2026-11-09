import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ANDROID_USER_AGENT,
  WEB_USER_AGENT,
  innertubeSessionHeaders,
  signsWithSapisid,
  upstreamRequest,
} from '../src/devUpstream.mjs'

faker.seed(11)

test('search posts the query with the WEB_REMIX context', () => {
  const query = faker.music.songName()

  const request = upstreamRequest('music_search', { query })

  assert.equal(request.endpoint, '/youtubei/v1/search')
  assert.equal(request.body.query, query)
  assert.equal(request.body.context.client.clientName, 'WEB_REMIX')
})

test('search posts filter params on the innertube body', () => {
  const query = faker.music.songName()
  const params = faker.string.alphanumeric(24)

  const request = upstreamRequest('music_search', { query, params })

  assert.equal(request.body.query, query)
  assert.equal(request.body.params, params)
})

test('home browses the music home feed', () => {
  const request = upstreamRequest('music_home', {})

  assert.equal(request.endpoint, '/youtubei/v1/browse')
  assert.equal(request.body.browseId, 'FEmusic_home')
  assert.equal(request.body.context.client.hl, 'pt')
  assert.equal(request.body.context.client.gl, 'BR')
})

test('browse posts an arbitrary music browse id', () => {
  const browseId = `FE${faker.string.alphanumeric(12)}`

  const request = upstreamRequest('music_browse', { browseId })

  assert.equal(request.endpoint, '/youtubei/v1/browse')
  assert.equal(request.body.browseId, browseId)
  assert.equal(request.body.context.client.clientName, 'WEB_REMIX')
})

test('queue can ask for a playlist mix', () => {
  const playlistId = `RDCLAK5uy_${faker.string.alphanumeric(12)}`

  const request = upstreamRequest('music_queue', { playlistId })

  assert.equal(request.endpoint, '/youtubei/v1/next')
  assert.equal(request.body.playlistId, playlistId)
})

test('queue reads the watch-next panel', () => {
  const videoId = faker.string.alphanumeric(11)

  const request = upstreamRequest('music_queue', { videoId })

  assert.equal(request.endpoint, '/youtubei/v1/next')
  assert.equal(request.body.videoId, videoId)
})

test('stream starts with the ANDROID client (itag 18 muxed)', () => {
  const videoId = faker.string.alphanumeric(11)

  const request = upstreamRequest('music_stream', { videoId })

  assert.equal(request.endpoint, '/youtubei/v1/player')
  assert.equal(request.body.context.client.clientName, 'ANDROID')
  assert.equal(request.body.context.client.osName, 'Android')
  assert.equal(request.body.context.client.androidSdkVersion, 30)
  assert.equal(request.body.contentCheckOk, true)
  assert.equal(request.userAgent, 'com.google.android.youtube/20.10.4 (Linux; U; Android 11) gzip')
})

test('suggestions, guide and account hit their captured paths', () => {
  assert.equal(
    upstreamRequest('music_suggestions', { input: 'x' }).endpoint,
    '/youtubei/v1/music/get_search_suggestions',
  )
  assert.equal(upstreamRequest('music_guide', {}).endpoint, '/youtubei/v1/guide')
  assert.equal(upstreamRequest('music_account', {}).endpoint, '/youtubei/v1/account/account_menu')
})

test('ANDROID /player skips WEB SAPISIDHASH and still sends cookies', () => {
  // Logged-in ANDROID /player + SAPISIDHASH is INVALID_ARGUMENT (probed 2026-11-06).
  const sapisid = faker.string.alphanumeric(24)
  const cookies = `SAPISID=${sapisid}; SID=${faker.string.alphanumeric(16)}`

  assert.equal(signsWithSapisid('music_stream'), false)
  const headers = innertubeSessionHeaders({
    command: 'music_stream',
    userAgent: ANDROID_USER_AGENT,
    cookies,
    sapisid,
    timestamp: 1_700_000_000,
  })

  assert.equal(headers.cookie, cookies)
  assert.equal(headers.authorization, undefined)
  assert.equal(headers['user-agent'], ANDROID_USER_AGENT)
})

test('WEB_REMIX browse still signs with SAPISIDHASH', () => {
  const sapisid = faker.string.alphanumeric(24)
  const cookies = `SAPISID=${sapisid}; SID=${faker.string.alphanumeric(16)}`

  assert.equal(signsWithSapisid('music_home'), true)
  const headers = innertubeSessionHeaders({
    command: 'music_home',
    userAgent: WEB_USER_AGENT,
    cookies,
    sapisid,
    timestamp: 1_700_000_000,
  })

  assert.equal(headers.cookie, cookies)
  assert.match(headers.authorization, /^SAPISIDHASH 1700000000_/)
  assert.equal(headers['x-goog-authuser'], '0')
})

test('unknown commands are rejected with the command name', () => {
  const command = `music_${faker.lorem.word()}`

  assert.throws(() => upstreamRequest(command, {}), new RegExp(command))
})
