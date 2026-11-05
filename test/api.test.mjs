import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { COMMANDS, createMusicApi, resolveInvoker } from '../src/api.mjs'

faker.seed(99)

function recordingInvoke() {
  const calls = []
  const invoke = async (command, args) => {
    calls.push({ command, args })
    return { command, args }
  }
  return { calls, invoke }
}

test('every mapped endpoint has a command', () => {
  assert.deepEqual(Object.keys(COMMANDS).sort(), [
    'account',
    'audio',
    'guide',
    'home',
    'queue',
    'search',
    'stream',
    'suggestions',
  ])
})

test('search sends the query as a command argument', async () => {
  const query = faker.music.songName()
  const { calls, invoke } = recordingInvoke()

  await createMusicApi(invoke).search(query)

  assert.deepEqual(calls, [{ command: 'music_search', args: { query } }])
})

test('stream and queue send the video id', async () => {
  const videoId = faker.string.alphanumeric(11)
  const { calls, invoke } = recordingInvoke()
  const api = createMusicApi(invoke)

  await api.stream(videoId)
  await api.queue(videoId)

  assert.deepEqual(calls, [
    { command: 'music_stream', args: { videoId } },
    { command: 'music_queue', args: { videoId } },
  ])
})

test('audio resolves the local proxy url for a video', async () => {
  const videoId = faker.string.alphanumeric(11)
  const { calls, invoke } = recordingInvoke()

  await createMusicApi(invoke).audio(videoId)
  await createMusicApi(invoke).audio(videoId, 'webm')

  assert.deepEqual(calls, [
    { command: 'music_audio', args: { videoId } },
    { command: 'music_audio', args: { videoId, container: 'webm' } },
  ])
})

test('home, guide and account need no arguments', async () => {
  const { calls, invoke } = recordingInvoke()
  const api = createMusicApi(invoke)

  await api.home()
  await api.guide()
  await api.account()

  assert.deepEqual(
    calls.map((call) => call.command),
    ['music_home', 'music_guide', 'music_account'],
  )
})

test('resolveInvoker prefers the Tauri global', () => {
  const invoke = async () => 'from-tauri'

  const resolved = resolveInvoker({ __TAURI__: { core: { invoke } } })

  assert.equal(resolved, invoke)
})

test('resolveInvoker falls back to the dev proxy fetch', async () => {
  const requested = []
  const fetchImpl = async (url, options) => {
    requested.push({ url, options })
    return { ok: true, json: async () => [] }
  }

  const resolved = resolveInvoker({ fetch: fetchImpl })
  await resolved('music_search', { query: 'daft punk' })

  assert.equal(requested[0].url, '/innertube/music_search')
  assert.equal(requested[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(requested[0].options.body), { query: 'daft punk' })
})
