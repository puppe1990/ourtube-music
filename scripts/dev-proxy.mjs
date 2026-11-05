import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'
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
    // Preview stub: the real device flow lives in the Rust shell. This keeps
    // the dialog (code + copy + link) testable in the browser.
    if (command === 'auth_start') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(
        JSON.stringify({
          deviceCode: 'preview-device-code',
          userCode: 'ABCD-EFGH',
          verificationUrl: 'https://www.google.com/device',
          expiresIn: 1800,
          interval: 5,
        }),
      )
      return
    }
    if (command === 'auth_poll') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify('pending'))
      return
    }
    if (command === 'open_external') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end('null')
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

async function proxyAudio(videoId, container, request, response) {
  try {
    const upstream = upstreamRequest('music_stream', { videoId })
    const playerResponse = await fetch(upstream.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify(upstream.body),
    })
    const stream = parseCommand('music_stream', await playerResponse.json(), { container })
    const headers = { 'user-agent': USER_AGENT }
    if (request.headers.range) headers.range = request.headers.range
    const media = await fetch(stream.audioUrl, { headers })
    const passthrough = {}
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = media.headers.get(name)
      if (value) passthrough[name] = value
    }
    response.writeHead(media.status, passthrough)
    if (!media.body) {
      response.end()
      return
    }
    Readable.fromWeb(media.body).pipe(response)
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
      url.searchParams.get('container') ?? 'mp4',
      request,
      response,
    )
    return
  }
  serveStatic(response, resolveStatic(url.pathname))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`OurTube Music preview: http://127.0.0.1:${PORT}`)
})
