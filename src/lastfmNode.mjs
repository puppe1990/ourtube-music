import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { lastFmMissingKeysError } from './lastfm.mjs'
import { lastFmAuthUrl, lastFmAuthUrlAllowed, signedForm } from './lastfmSign.mjs'

const API = 'https://ws.audioscrobbler.com/2.0/'
const FILE = 'lastfm.json'

function emptyStore() {
  return { apiKey: '', apiSecret: '', sessionKey: '', username: '', pendingToken: '' }
}

function readStore(dir) {
  const path = join(dir, FILE)
  if (!existsSync(path)) return emptyStore()
  try {
    return { ...emptyStore(), ...JSON.parse(readFileSync(path, 'utf8')) }
  } catch {
    return emptyStore()
  }
}

function writeStore(dir, store) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, FILE), JSON.stringify(store, null, 2), { mode: 0o600 })
}

function keysOf(store, env) {
  return {
    apiKey: env.LASTFM_API_KEY || store.apiKey || '',
    apiSecret: env.LASTFM_API_SECRET || store.apiSecret || '',
  }
}

export function createLastFmNode({ dir, env = process.env, fetchImpl = fetch, openUrl }) {
  let store = readStore(dir)

  function reload() {
    store = readStore(dir)
  }

  function persist() {
    writeStore(dir, store)
  }

  function keys() {
    return keysOf(store, env)
  }

  function requireKeys() {
    const { apiKey, apiSecret } = keys()
    if (!apiKey || !apiSecret) throw new Error(lastFmMissingKeysError())
    return { apiKey, apiSecret }
  }

  function state() {
    reload()
    const { apiKey, apiSecret } = keys()
    return {
      connected: Boolean(store.sessionKey && store.username),
      username: store.username || '',
      pending: Boolean(store.pendingToken) && !store.sessionKey,
      hasKeys: Boolean(apiKey && apiSecret),
    }
  }

  async function call(params) {
    const { apiKey, apiSecret } = requireKeys()
    const body = signedForm({ ...params, api_key: apiKey }, apiSecret)
    const response = await fetchImpl(API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: body.toString(),
    })
    const payload = await response.json()
    if (payload?.error) {
      const error = new Error(payload.message || `Last.fm error ${payload.error}`)
      error.code = payload.error
      throw error
    }
    return payload
  }

  async function login() {
    reload()
    const { apiKey } = requireKeys()
    const payload = await call({ method: 'auth.getToken' })
    const token = payload.token
    if (!token) throw new Error('Last.fm não devolveu um token')
    store = { ...store, pendingToken: token, sessionKey: '', username: '' }
    persist()
    const authUrl = lastFmAuthUrl(apiKey, token)
    if (!lastFmAuthUrlAllowed(authUrl)) {
      throw new Error(`last.fm auth url rejected: ${authUrl}`)
    }
    if (openUrl) await openUrl(authUrl)
    return { ...state(), authUrl, pending: true }
  }

  async function complete() {
    reload()
    if (!store.pendingToken) return state()
    try {
      const payload = await call({ method: 'auth.getSession', token: store.pendingToken })
      store = {
        ...store,
        sessionKey: payload.session?.key || '',
        username: payload.session?.name || '',
        pendingToken: '',
      }
      persist()
      return state()
    } catch (error) {
      if (error.code === 14) return { ...state(), pending: true }
      throw error
    }
  }

  async function logout() {
    reload()
    store = { ...store, sessionKey: '', username: '', pendingToken: '' }
    persist()
    return state()
  }

  async function updateNowPlaying(payload) {
    reload()
    if (!store.sessionKey) return { skipped: true }
    const params = {
      method: 'track.updateNowPlaying',
      sk: store.sessionKey,
      artist: payload.artist,
      track: payload.track,
    }
    if (payload.album) params.album = payload.album
    if (payload.duration) params.duration = String(payload.duration)
    await call(params)
    return { ok: true }
  }

  async function scrobble(payload) {
    reload()
    if (!store.sessionKey) return { skipped: true }
    const params = {
      method: 'track.scrobble',
      sk: store.sessionKey,
      'artist[0]': payload.artist,
      'track[0]': payload.track,
      'timestamp[0]': String(payload.timestamp),
    }
    if (payload.album) params['album[0]'] = payload.album
    if (payload.duration) params['duration[0]'] = String(payload.duration)
    await call(params)
    return { ok: true }
  }

  return { state, login, complete, logout, updateNowPlaying, scrobble }
}
