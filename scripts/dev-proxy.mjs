import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCommand } from '../src/devParsers.mjs'
import { upstreamRequest } from '../src/devUpstream.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.env.PORT ?? 8794)
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
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
    if (command === 'auth_state') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ loggedIn: false, displayName: '' }))
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
    const upstream = upstreamRequest(command, args)
    const upstreamResponse = await fetch(upstream.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
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
    if (command === 'music_home' && parsed.length === 0) {
      const explore = upstreamRequest('music_home', args)
      explore.body.browseId = 'FEmusic_explore'
      const retry = await fetch(upstream.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
        body: JSON.stringify(explore.body),
      })
      parsed = parseCommand('music_home', await retry.json())
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

function authCookies() {
  try {
    const path = join(
      homedir(),
      'Library/Application Support/com.gestaobem.ourtube-music/credentials.json',
    )
    return JSON.parse(readFileSync(path, 'utf8')).cookies ?? ''
  } catch (_error) {
    return ''
  }
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
          'user-agent': USER_AGENT,
          cookie: authCookies(),
          range: `bytes=${offset}-${offset + size - 1}`,
        },
      })
      debugMedia(
        `${offset} window=${size} status=${candidate.status} cookies=${authCookies().length}`,
      )
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
    const key = `${videoId}:${variant}`
    let entry = mediaCache.get(key)
    if (!entry || Date.now() - entry.at > MEDIA_TTL_MS) {
      const upstream = upstreamRequest('music_stream', { videoId })
      const playerResponse = await fetch(upstream.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
          cookie: authCookies(),
        },
        body: JSON.stringify(upstream.body),
      })
      const stream = parseCommand('music_stream', await playerResponse.json(), { variant })
      const bytes = await downloadMedia(stream.audioUrl)
      entry = { mime: stream.mimeType, bytes, at: Date.now() }
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
