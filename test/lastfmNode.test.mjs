import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { lastFmMissingKeysError } from '../src/lastfm.mjs'
import { apiSignature } from '../src/lastfmSign.mjs'
import { createLastFmNode } from '../src/lastfmNode.mjs'

faker.seed(73)

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'ourtube-lastfm-'))
}

function jsonResponse(body) {
  return {
    ok: true,
    async json() {
      return body
    },
    async text() {
      return JSON.stringify(body)
    },
  }
}

test('state picks up a session written after the node starts', async () => {
  const dir = await tempDir()
  const node = createLastFmNode({
    dir,
    env: {
      LASTFM_API_KEY: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
      LASTFM_API_SECRET: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
    },
  })
  const username = faker.internet.username()
  const sessionKey = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()

  assert.equal(node.state().connected, false)
  await writeFile(
    join(dir, 'lastfm.json'),
    JSON.stringify({ sessionKey, username, pendingToken: '' }),
  )

  assert.equal(node.state().connected, true)
  assert.equal(node.state().username, username)
})

test('state is disconnected until a session key is stored', async () => {
  const node = createLastFmNode({
    dir: await tempDir(),
    env: {
      LASTFM_API_KEY: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
      LASTFM_API_SECRET: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
    },
  })

  assert.deepEqual(node.state(), {
    connected: false,
    username: '',
    pending: false,
    hasKeys: true,
  })
})

test('login without keys explains how to create a Last.fm API account', async () => {
  const node = createLastFmNode({ dir: await tempDir(), env: {} })

  await assert.rejects(
    () => node.login(),
    (error) => {
      assert.equal(error.message, lastFmMissingKeysError())
      return true
    },
  )
})

test('login asks for a token, persists it, and opens the allowlisted auth URL', async () => {
  const dir = await tempDir()
  const apiKey = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const secret = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const token = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const opened = []
  const posts = []
  const node = createLastFmNode({
    dir,
    env: { LASTFM_API_KEY: apiKey, LASTFM_API_SECRET: secret },
    openUrl: async (url) => {
      opened.push(url)
    },
    fetchImpl: async (url, options) => {
      posts.push({ url, options })
      return jsonResponse({ token })
    },
  })

  const result = await node.login()

  assert.equal(result.pending, true)
  assert.equal(result.authUrl, `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`)
  assert.deepEqual(opened, [result.authUrl])
  assert.equal(posts[0].url, 'https://ws.audioscrobbler.com/2.0/')
  assert.equal(posts[0].options.method, 'POST')
  const body = new URLSearchParams(posts[0].options.body)
  assert.equal(body.get('method'), 'auth.getToken')
  assert.equal(body.get('api_key'), apiKey)
  assert.equal(body.get('format'), 'json')
  assert.equal(
    body.get('api_sig'),
    apiSignature({ method: 'auth.getToken', api_key: apiKey }, secret),
  )
  const saved = JSON.parse(await readFile(join(dir, 'lastfm.json'), 'utf8'))
  assert.equal(saved.pendingToken, token)
})

test('complete exchanges the pending token for a session key', async () => {
  const dir = await tempDir()
  const apiKey = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const secret = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const token = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const sessionKey = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const username = faker.internet.username()
  const node = createLastFmNode({
    dir,
    env: { LASTFM_API_KEY: apiKey, LASTFM_API_SECRET: secret },
    openUrl: async () => {},
    fetchImpl: async (_url, options) => {
      const body = new URLSearchParams(options.body)
      if (body.get('method') === 'auth.getToken') return jsonResponse({ token })
      assert.equal(body.get('method'), 'auth.getSession')
      assert.equal(body.get('token'), token)
      return jsonResponse({ session: { name: username, key: sessionKey, subscriber: 0 } })
    },
  })

  await node.login()
  const result = await node.complete()

  assert.equal(result.connected, true)
  assert.equal(result.username, username)
  assert.equal(result.pending, false)
  const saved = JSON.parse(await readFile(join(dir, 'lastfm.json'), 'utf8'))
  assert.equal(saved.sessionKey, sessionKey)
  assert.equal(saved.username, username)
  assert.equal(saved.pendingToken, '')
})

test('complete treats Last.fm error 14 as still pending', async () => {
  const dir = await tempDir()
  const apiKey = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const secret = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const node = createLastFmNode({
    dir,
    env: { LASTFM_API_KEY: apiKey, LASTFM_API_SECRET: secret },
    openUrl: async () => {},
    fetchImpl: async (_url, options) => {
      const body = new URLSearchParams(options.body)
      if (body.get('method') === 'auth.getToken') {
        return jsonResponse({ token: faker.string.hexadecimal({ length: 32, prefix: '' }) })
      }
      return jsonResponse({ error: 14, message: 'This token has not been authorized' })
    },
  })

  await node.login()
  const result = await node.complete()

  assert.equal(result.connected, false)
  assert.equal(result.pending, true)
})

test('now playing and scrobble are no-ops until a session exists', async () => {
  const posts = []
  const node = createLastFmNode({
    dir: await tempDir(),
    env: {
      LASTFM_API_KEY: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
      LASTFM_API_SECRET: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
    },
    fetchImpl: async (url, options) => {
      posts.push({ url, options })
      return jsonResponse({})
    },
  })
  const artist = faker.person.fullName()
  const title = faker.music.songName()

  await node.updateNowPlaying({ artist, track: title, duration: 180 })
  await node.scrobble({
    artist,
    track: title,
    duration: 180,
    timestamp: 1_700_000_000,
  })

  assert.equal(posts.length, 0)
})

test('scrobble posts indexed track fields with a session key', async () => {
  const dir = await tempDir()
  const apiKey = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const secret = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const sessionKey = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const username = faker.internet.username()
  const token = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const posts = []
  const node = createLastFmNode({
    dir,
    env: { LASTFM_API_KEY: apiKey, LASTFM_API_SECRET: secret },
    openUrl: async () => {},
    fetchImpl: async (_url, options) => {
      const body = new URLSearchParams(options.body)
      posts.push(Object.fromEntries(body.entries()))
      if (body.get('method') === 'auth.getToken') return jsonResponse({ token })
      if (body.get('method') === 'auth.getSession') {
        return jsonResponse({ session: { name: username, key: sessionKey } })
      }
      return jsonResponse({ scrobbles: { '@attr': { accepted: 1 } } })
    },
  })
  const artist = faker.person.fullName()
  const title = faker.music.songName()
  const album = faker.commerce.productName()

  await node.login()
  await node.complete()
  posts.length = 0
  await node.scrobble({
    artist,
    track: title,
    album,
    duration: 240,
    timestamp: 1_700_000_050,
  })

  assert.equal(posts[0].method, 'track.scrobble')
  assert.equal(posts[0]['artist[0]'], artist)
  assert.equal(posts[0]['track[0]'], title)
  assert.equal(posts[0]['album[0]'], album)
  assert.equal(posts[0]['duration[0]'], '240')
  assert.equal(posts[0]['timestamp[0]'], '1700000050')
  assert.equal(posts[0].sk, sessionKey)
  assert.equal(posts[0].api_key, apiKey)
  assert.ok(posts[0].api_sig)
  assert.equal(posts[0].format, 'json')
})
