import { execFile } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { bindYoutubeSession, sessionIsYoutubeBound } from '../src/authCookies.mjs'
import {
  parseCommand,
  parseListAccountRows,
  parseListAccounts,
  parseLyrics,
  parseLyricsBrowseId,
} from '../src/devParsers.mjs'
import { followHomeContinuations } from '../src/homeFeed.mjs'
import { overlaySyncedLyrics } from '../src/lyrics.mjs'
import { fetchSyncedLyrics } from '../src/lrclib.mjs'
import {
  ANDROID_USER_AGENT,
  WEB_USER_AGENT,
  innertubeSessionHeaders,
  upstreamRequest,
} from '../src/devUpstream.mjs'
import { createLastFmNode } from '../src/lastfmNode.mjs'
import { createOfflineNode, sanitizeVideoId } from '../src/offlineNode.mjs'
import { lastFmAuthUrlAllowed } from '../src/lastfmSign.mjs'
import { playbackSource } from '../src/playback.mjs'
import { mergeAccount } from '../src/session.mjs'

const execFileAsync = promisify(execFile)

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.env.PORT ?? 8794)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

// `/src/*` lives outside web/ so the same module works in the Tauri build,
// where make-tauri-dist copies both trees side by side.
function resolveStatic(pathname) {
  if (pathname.startsWith('/src/')) return join(ROOT, normalize(pathname))
  return join(ROOT, 'web', normalize(pathname === '/' ? '/index.html' : pathname))
}

function serveStatic(response, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
    return
  }
  response.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
  createReadStream(filePath).pipe(response)
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

async function proxyCommand(command, request, response) {
  let args
  try {
    args = await readJson(request)
  } catch (error) {
    response.writeHead(400, { 'content-type': 'text/plain' }).end(`invalid JSON: ${error.message}`)
    return
  }
  try {
    if (command.startsWith('lastfm_')) {
      await proxyLastFm(command, args, response)
      return
    }
    if (command.startsWith('offline_')) {
      await proxyOffline(command, args, response)
      return
    }
    if (command === 'auth_state') {
      const creds = (await credentialsForInnertube()) ?? loadCredentials()
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      if (!creds?.sapisid) {
        response.end(
          JSON.stringify({
            loggedIn: false,
            displayName: '',
            email: '',
            handle: '',
            photoUrl: '',
            accounts: [],
          }),
        )
        return
      }
      const accounts = await listGoogleAccounts(creds)
      const listed = accounts[0] ?? parseListAccounts({})
      let menu = { displayName: '', email: '', handle: '', photoUrl: '' }
      try {
        const upstream = upstreamRequest('music_account', {})
        const upstreamResponse = await fetch(upstream.url, {
          method: 'POST',
          headers: innertubeHeaders('music_account', WEB_USER_AGENT),
          body: JSON.stringify(upstream.body),
        })
        if (upstreamResponse.ok) {
          menu = parseCommand('music_account', await upstreamResponse.json())
        }
      } catch (_error) {
        // Innertube account_menu is optional; ListAccounts carries the email.
      }
      const account = mergeAccount(listed, menu, {
        displayName: creds.display_name ?? '',
        email: creds.email ?? '',
      })
      response.end(
        JSON.stringify({
          loggedIn: true,
          displayName: account.displayName,
          email: account.email,
          handle: account.handle,
          photoUrl: account.photoUrl,
          accounts,
        }),
      )
      return
    }
    if (command === 'auth_logout') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end('null')
      return
    }
    // The Google window only exists in the Tauri shell.
    if (command === 'auth_browser_login') {
      response.writeHead(501, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('o login Google só funciona na janela Tauri')
      return
    }
    if (command === 'auth_check') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify('no_window'))
      return
    }
    if (command === 'music_audio') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(`/audio/${args.videoId}`))
      return
    }
    if (command === 'music_lyrics') {
      await proxyLyrics(args, response)
      return
    }
    await credentialsForInnertube()
    const upstream = upstreamRequest(command, args)
    const upstreamResponse = await fetch(upstream.url, {
      method: 'POST',
      headers: innertubeHeaders(command, upstream.userAgent),
      body: JSON.stringify(upstream.body),
    })
    const payload = await upstreamResponse.text()
    if (!upstreamResponse.ok) {
      response.writeHead(upstreamResponse.status, {
        'content-type': 'application/json; charset=utf-8',
      })
      response.end(payload)
      return
    }
    // The desktop shell parses in Rust; the preview parses here so both answer
    // with the same shapes (see src/devParsers.mjs).
    let parsed = parseCommand(command, JSON.parse(payload))
    // Anonymous FEmusic_home is flaky; mirror the Rust fallback to explore.
    // Mood-chip filters stay on home — explore is a different page.
    if (command === 'music_home' && homeIsEmpty(parsed) && !args.params) {
      const explore = upstreamRequest('music_home', args)
      explore.body.browseId = 'FEmusic_explore'
      const retry = await fetch(upstream.url, {
        method: 'POST',
        headers: innertubeHeaders('music_home', WEB_USER_AGENT),
        body: JSON.stringify(explore.body),
      })
      parsed = parseCommand('music_home', await retry.json())
    }
    if (command === 'music_home') {
      parsed = await followHomeContinuations(parsed, fetchBrowseContinuation)
    }
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(parsed))
  } catch (error) {
    response
      .writeHead(502, { 'content-type': 'text/plain' })
      .end(`upstream failed: ${error.message}`)
  }
}

// googlevideo 403s spans above ~1 MiB, so the proxy downloads the whole track
// once in shrinking windows and serves byte ranges from memory.
const RANGE_WINDOWS = [256 * 1024, 64 * 1024, 16 * 1024]
const MEDIA_TTL_MS = 15 * 60 * 1000
const mediaCache = new Map()

function parseRange(header, total) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header ?? '')
  if (!match) return { start: 0, end: total }
  const start = Number(match[1])
  if (start >= total) return null
  const end = match[2] === '' ? total : Math.min(Number(match[2]) + 1, total)
  return end <= start ? null : { start, end }
}

function appConfigDir() {
  return join(homedir(), 'Library/Application Support/com.gestaobem.ourtube-music')
}

function credentialsPath() {
  return join(appConfigDir(), 'credentials.json')
}

const lastfm = createLastFmNode({
  dir: appConfigDir(),
  openUrl: async (url) => {
    if (!lastFmAuthUrlAllowed(url)) throw new Error(`last.fm auth url rejected: ${url}`)
    await execFileAsync('open', [url])
  },
})

const offline = createOfflineNode({ dir: appConfigDir() })

function clock(seconds) {
  const value = Number(seconds) || 0
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
}

async function fetchTrackBytes(videoId) {
  await credentialsForInnertube()
  const upstream = upstreamRequest('music_stream', { videoId })
  const playerResponse = await fetch(upstream.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': upstream.userAgent,
      cookie: authCookies(),
    },
    body: JSON.stringify(upstream.body),
  })
  const stream = parseCommand('music_stream', await playerResponse.json(), { variant: 'muxed' })
  const source = playbackSource(stream, 'muxed')
  const bytes = await downloadMedia(source.url)
  return { stream, bytes }
}

async function proxyOffline(command, args, response) {
  try {
    let payload
    if (command === 'offline_list') payload = offline.view()
    else if (command === 'offline_save') {
      sanitizeVideoId(args.videoId)
      if (offline.has(args.videoId)) payload = offline.get(args.videoId)
      else {
        const { stream, bytes } = await fetchTrackBytes(args.videoId)
        payload = offline.put(
          {
            videoId: args.videoId,
            title: args.title || stream.title,
            artist: args.artist || stream.author,
            album: args.album || '',
            duration: args.duration || clock(stream.duration),
            thumbnail: args.thumbnail || '',
            browseId: args.browseId || '',
            playlistId: args.playlistId || '',
            mimeType: stream.mimeType || 'audio/mp4',
          },
          bytes,
        )
      }
    } else if (command === 'offline_remove') {
      sanitizeVideoId(args.videoId)
      payload = { removed: offline.remove(args.videoId) }
    } else if (command === 'offline_remove_album') {
      payload = { removed: offline.removeAlbum(args.browseId) }
    } else {
      throw new Error(`unknown offline command ${command}`)
    }
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(payload))
  } catch (error) {
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(error.message)
  }
}

async function proxyLastFm(command, args, response) {
  try {
    let payload
    if (command === 'lastfm_state') payload = lastfm.state()
    else if (command === 'lastfm_login') payload = await lastfm.login()
    else if (command === 'lastfm_complete') payload = await lastfm.complete()
    else if (command === 'lastfm_logout') payload = await lastfm.logout()
    else if (command === 'lastfm_now_playing') payload = await lastfm.updateNowPlaying(args)
    else if (command === 'lastfm_scrobble') payload = await lastfm.scrobble(args)
    else {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(`unknown last.fm command: ${command}`)
      return
    }
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(payload))
  } catch (error) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(error.message)
  }
}

function loadCredentials() {
  try {
    return JSON.parse(readFileSync(credentialsPath(), 'utf8'))
  } catch (_error) {
    return null
  }
}

function saveCredentials(creds) {
  writeFileSync(credentialsPath(), `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 })
}

let bindPromise

async function credentialsForInnertube() {
  const creds = loadCredentials()
  if (!creds?.sapisid) return creds
  if (sessionIsYoutubeBound(creds)) return creds
  if (!bindPromise) {
    bindPromise = bindYoutubeSession(creds)
      .then((next) => {
        saveCredentials(next)
        return next
      })
      .catch((error) => {
        bindPromise = null
        console.error(`youtube SetSID failed: ${error.message}`)
        return creds
      })
  }
  return bindPromise
}

async function listGoogleAccounts(creds) {
  if (!creds?.identity_cookies) return []
  try {
    const response = await fetch(
      'https://accounts.google.com/ListAccounts?gpsia=1&source=ogb&json=standard',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://ogs.google.com',
          referer: 'https://ogs.google.com/',
          cookie: creds.identity_cookies,
          'user-agent': WEB_USER_AGENT,
        },
        body: 'gpsia=1&source=ogb&json=standard',
      },
    )
    if (!response.ok) return []
    return parseListAccountRows(await response.json())
  } catch (_error) {
    return []
  }
}

function authCookies() {
  return loadCredentials()?.cookies ?? ''
}

async function proxyLyrics(args, response) {
  await credentialsForInnertube()
  const empty = { lines: [], cues: [], source: '', message: 'Letra não disponível' }
  let lyrics = empty
  const next = upstreamRequest('music_queue', { videoId: args.videoId })
  const nextResponse = await fetch(next.url, {
    method: 'POST',
    headers: innertubeHeaders('music_queue', next.userAgent),
    body: JSON.stringify(next.body),
  })
  const nextPayload = await nextResponse.json()
  const browseId = parseLyricsBrowseId(nextPayload)
  if (browseId) {
    const browse = upstreamRequest('music_browse', { browseId })
    const browseResponse = await fetch(browse.url, {
      method: 'POST',
      headers: innertubeHeaders('music_browse', browse.userAgent),
      body: JSON.stringify(browse.body),
    })
    lyrics = parseLyrics(await browseResponse.json())
  }
  const lrc = await fetchSyncedLyrics({
    track: args.title,
    artist: args.artist,
    durationSec: args.durationSec,
  })
  if (lrc) lyrics = overlaySyncedLyrics(lyrics, lrc)
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(lyrics))
}

function innertubeHeaders(command, userAgent) {
  const creds = loadCredentials()
  return innertubeSessionHeaders({
    command,
    userAgent,
    cookies: creds?.cookies ?? '',
    sapisid: creds?.sapisid ?? '',
    timestamp: Math.floor(Date.now() / 1000),
  })
}

function homeIsEmpty(feed) {
  return !Array.isArray(feed?.shelves) || feed.shelves.length === 0
}

async function fetchBrowseContinuation(token) {
  const upstream = upstreamRequest('music_browse', { continuation: token })
  const retry = await fetch(upstream.url, {
    method: 'POST',
    headers: innertubeHeaders('music_browse', WEB_USER_AGENT),
    body: JSON.stringify(upstream.body),
  })
  if (!retry.ok) return { shelves: [], continuation: '' }
  return parseCommand('music_browse', await retry.json())
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function downloadMedia(url) {
  const chunks = []
  let offset = 0
  let stalls = 0
  for (;;) {
    await sleep(120)
    let response
    for (const size of RANGE_WINDOWS) {
      const candidate = await fetch(url, {
        headers: {
          'user-agent': ANDROID_USER_AGENT,
          range: `bytes=${offset}-${offset + size - 1}`,
        },
      })
      debugMedia(`${offset} window=${size} status=${candidate.status}`)
      if (candidate.status !== 403) {
        response = candidate
        break
      }
      response = candidate
    }
    if (!response?.ok && response?.status === 403 && stalls < 4) {
      stalls += 1
      await sleep(800 * stalls)
      continue
    }
    if (!response || !response.ok) throw new Error(`media HTTP ${response?.status ?? 0}`)
    stalls = 0
    const total = Number(/\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1] ?? 0)
    const chunk = Buffer.from(await response.arrayBuffer())
    if (chunk.length === 0) break
    chunks.push(chunk)
    offset += chunk.length
    if (total && offset >= total) break
  }
  return Buffer.concat(chunks)
}

function debugMedia(message) {
  if (process.env.OURTUBE_DEBUG) console.log(`[media] ${message}`)
}

async function proxyAudio(videoId, variant, request, response) {
  try {
    const disk = offline.readMedia(videoId)
    if (disk) {
      const slice = parseRange(request.headers.range, disk.bytes.length)
      if (!slice) {
        response.writeHead(416, { 'content-type': 'text/plain' }).end('range not satisfiable')
        return
      }
      const body = disk.bytes.subarray(slice.start, slice.end)
      const partial = slice.start !== 0 || slice.end !== disk.bytes.length
      response.writeHead(partial ? 206 : 200, {
        'content-type': disk.mime,
        'accept-ranges': 'bytes',
        'content-range': `bytes ${slice.start}-${slice.end - 1}/${disk.bytes.length}`,
        'content-length': body.length,
        'cache-control': 'no-store',
      })
      response.end(body)
      return
    }
    const key = `${videoId}:${variant}`
    let entry = mediaCache.get(key)
    if (!entry || Date.now() - entry.at > MEDIA_TTL_MS) {
      const upstream = upstreamRequest('music_stream', { videoId })
      const playerResponse = await fetch(upstream.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': upstream.userAgent,
          cookie: authCookies(),
        },
        body: JSON.stringify(upstream.body),
      })
      const stream = parseCommand('music_stream', await playerResponse.json(), { variant })
      const source = playbackSource(stream, variant || undefined)
      const bytes = await downloadMedia(source.url)
      entry = { mime: source.mimeType, bytes, at: Date.now() }
      mediaCache.set(key, entry)
    }
    const slice = parseRange(request.headers.range, entry.bytes.length)
    if (!slice) {
      response.writeHead(416, { 'content-type': 'text/plain' }).end('range not satisfiable')
      return
    }
    const body = entry.bytes.subarray(slice.start, slice.end)
    const partial = slice.start !== 0 || slice.end !== entry.bytes.length
    response.writeHead(partial ? 206 : 200, {
      'content-type': entry.mime,
      'accept-ranges': 'bytes',
      'content-range': `bytes ${slice.start}-${slice.end - 1}/${entry.bytes.length}`,
      'content-length': body.length,
      'cache-control': 'no-store',
    })
    response.end(body)
  } catch (error) {
    response.writeHead(502, { 'content-type': 'text/plain' }).end(`audio failed: ${error.message}`)
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`)
  if (request.method === 'POST' && url.pathname.startsWith('/innertube/')) {
    await proxyCommand(url.pathname.replace('/innertube/', ''), request, response)
    return
  }
  if (request.method === 'GET' && url.pathname.startsWith('/audio/')) {
    await proxyAudio(
      url.pathname.slice('/audio/'.length),
      url.searchParams.get('variant') ?? '',
      request,
      response,
    )
    return
  }
  serveStatic(response, resolveStatic(url.pathname))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`OurTube Music preview: http://127.0.0.1:${PORT}`)
})
