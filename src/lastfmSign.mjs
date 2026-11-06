import { createHash } from 'node:crypto'

const SKIP = new Set(['format', 'callback', 'api_sig'])

export function apiSignature(params, secret) {
  const keys = Object.keys(params)
    .filter((key) => !SKIP.has(key))
    .sort()
  const concat = keys.map((key) => `${key}${params[key] ?? ''}`).join('') + secret
  return createHash('md5').update(concat, 'utf8').digest('hex')
}

export function lastFmAuthUrl(apiKey, token) {
  return `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`
}

export function lastFmAuthUrlAllowed(url) {
  if (typeof url !== 'string' || url.includes(' ') || url.includes('\n')) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (parsed.hostname !== 'www.last.fm' && parsed.hostname !== 'last.fm') return false
    return parsed.pathname === '/api/auth' || parsed.pathname === '/api/auth/'
  } catch {
    return false
  }
}

export function signedForm(params, secret) {
  const body = { ...params, api_sig: apiSignature(params, secret), format: 'json' }
  return new URLSearchParams(body)
}
