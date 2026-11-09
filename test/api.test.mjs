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
    'authBrowserLogin',
    'authCheck',
    'authLogout',
    'authRefresh',
    'authState',
    'browse',
    'guide',
    'home',
    'lastfmComplete',
    'lastfmLogin',
    'lastfmLogout',
    'lastfmNowPlaying',
    'lastfmScrobble',
    'lastfmState',
    'lyrics',
    'offlineList',
    'offlineRemove',
    'offlineRemoveAlbum',
    'offlineSave',
    'queue',
    'search',
    'stream',
    'suggestions',
  ])
})

test('offline save and remove send the video id', async () => {
  const videoId = faker.string.alphanumeric(11)
  const browseId = `MPREb_${faker.string.alphanumeric(8)}`
  const { calls, invoke } = recordingInvoke()
  const api = createMusicApi(invoke)

  await api.offlineList()
  await api.offlineSave({ videoId, browseId })
  await api.offlineRemove(videoId)
  await api.offlineRemoveAlbum(browseId)

  assert.deepEqual(calls, [
    { command: 'offline_list', args: undefined },
    { command: 'offline_save', args: { videoId, browseId } },
    { command: 'offline_remove', args: { videoId } },
    { command: 'offline_remove_album', args: { browseId } },
  ])
})

test('search sends the query as a command argument', async () => {
  const query = faker.music.songName()
  const { calls, invoke } = recordingInvoke()

  await createMusicApi(invoke).search(query)

  assert.deepEqual(calls, [{ command: 'music_search', args: { query } }])
})

test('search sends innertube filter params when given', async () => {
  const query = faker.music.songName()
  const params = faker.string.alphanumeric(24)
  const { calls, invoke } = recordingInvoke()

  await createMusicApi(invoke).search(query, params)

  assert.deepEqual(calls, [{ command: 'music_search', args: { query, params } }])
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

test('queue can send a playlist mix id', async () => {
  const playlistId = `RDCLAK5uy_${faker.string.alphanumeric(12)}`
  const { calls, invoke } = recordingInvoke()

  await createMusicApi(invoke).queue('', playlistId)

  assert.deepEqual(calls, [{ command: 'music_queue', args: { videoId: '', playlistId } }])
})

test('audio resolves the local proxy url for a video', async () => {
  const videoId = faker.string.alphanumeric(11)
  const { calls, invoke } = recordingInvoke()

  await createMusicApi(invoke).audio(videoId)
  await createMusicApi(invoke).audio(videoId, 'muxed')

  assert.deepEqual(calls, [
    { command: 'music_audio', args: { videoId } },
    { command: 'music_audio', args: { videoId, variant: 'muxed' } },
  ])
})

test('browser login and check need no arguments', async () => {
  const { calls, invoke } = recordingInvoke()
  const api = createMusicApi(invoke)

  await api.authBrowserLogin()
  await api.authCheck()

  assert.deepEqual(
    calls.map((call) => call.command),
    ['auth_browser_login', 'auth_check'],
  )
})

test('lyrics sends the playing video id', async () => {
  const videoId = faker.string.alphanumeric(11)
  const { calls, invoke } = recordingInvoke()

  await createMusicApi(invoke).lyrics(videoId)

  assert.deepEqual(calls, [{ command: 'music_lyrics', args: { videoId } }])
})

test('lyrics forwards title artist and duration for the synced lookup', async () => {
  const videoId = faker.string.alphanumeric(11)
  const title = faker.music.songName()
  const artist = faker.music.artist()
  const durationSec = faker.number.int({ min: 90, max: 420 })
  const { calls, invoke } = recordingInvoke()

  await createMusicApi(invoke).lyrics(videoId, { title, artist, durationSec })

  assert.deepEqual(calls, [
    { command: 'music_lyrics', args: { videoId, title, artist, durationSec } },
  ])
})

test('browse sends the Innertube browse id', async () => {
  const browseId = `FE${faker.string.alphanumeric(12)}`
  const { calls, invoke } = recordingInvoke()

  await createMusicApi(invoke).browse(browseId)

  assert.deepEqual(calls, [{ command: 'music_browse', args: { browseId } }])
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

test('last.fm commands send the scrobble payload', async () => {
  const artist = faker.person.fullName()
  const track = faker.music.songName()
  const { calls, invoke } = recordingInvoke()
  const api = createMusicApi(invoke)

  await api.lastfmState()
  await api.lastfmLogin()
  await api.lastfmComplete()
  await api.lastfmNowPlaying({ artist, track, duration: 180 })
  await api.lastfmScrobble({ artist, track, duration: 180, timestamp: 1_700_000_000 })
  await api.lastfmLogout()

  assert.deepEqual(
    calls.map((call) => call.command),
    [
      'lastfm_state',
      'lastfm_login',
      'lastfm_complete',
      'lastfm_now_playing',
      'lastfm_scrobble',
      'lastfm_logout',
    ],
  )
  assert.deepEqual(calls[3].args, { artist, track, duration: 180 })
  assert.equal(calls[4].args.timestamp, 1_700_000_000)
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
