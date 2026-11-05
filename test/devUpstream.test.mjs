import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { upstreamRequest } from '../src/devUpstream.mjs'

faker.seed(11)

test('search posts the query with the WEB_REMIX context', () => {
  const query = faker.music.songName()

  const request = upstreamRequest('music_search', { query })

  assert.equal(request.endpoint, '/youtubei/v1/search')
  assert.equal(request.body.query, query)
  assert.equal(request.body.context.client.clientName, 'WEB_REMIX')
})

test('home browses the music home feed', () => {
  const request = upstreamRequest('music_home', {})

  assert.equal(request.endpoint, '/youtubei/v1/browse')
  assert.equal(request.body.browseId, 'FEmusic_home')
})

test('queue reads the watch-next panel', () => {
  const videoId = faker.string.alphanumeric(11)

  const request = upstreamRequest('music_queue', { videoId })

  assert.equal(request.endpoint, '/youtubei/v1/next')
  assert.equal(request.body.videoId, videoId)
})

test('stream starts with the iOS client (no bot check)', () => {
  const videoId = faker.string.alphanumeric(11)

  const request = upstreamRequest('music_stream', { videoId })

  assert.equal(request.endpoint, '/youtubei/v1/player')
  assert.equal(request.body.context.client.clientName, 'IOS')
  assert.equal(request.body.context.client.deviceModel, 'iPhone16,2')
  assert.equal(request.body.contentCheckOk, true)
})

test('suggestions, guide and account hit their captured paths', () => {
  assert.equal(
    upstreamRequest('music_suggestions', { input: 'x' }).endpoint,
    '/youtubei/v1/music/get_search_suggestions',
  )
  assert.equal(upstreamRequest('music_guide', {}).endpoint, '/youtubei/v1/guide')
  assert.equal(upstreamRequest('music_account', {}).endpoint, '/youtubei/v1/account/account_menu')
})

test('unknown commands are rejected with the command name', () => {
  const command = `music_${faker.lorem.word()}`

  assert.throws(() => upstreamRequest(command, {}), new RegExp(command))
})
