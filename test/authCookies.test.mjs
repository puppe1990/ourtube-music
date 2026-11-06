import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applySetCookies,
  bindYoutubeSession,
  cookieHeader,
  handshakeCookieHeader,
  parseCookieHeader,
  youtubeSessionReady,
} from '../src/authCookies.mjs'

faker.seed(17)

test('cookieHeader keeps LOGIN_INFO from the YouTube jar', () => {
  const loginInfo = faker.string.alphanumeric(12)

  const header = cookieHeader([
    ['SAPISID', 'abc'],
    ['LOGIN_INFO', loginInfo],
  ])

  assert.match(header, new RegExp(`LOGIN_INFO=${loginInfo}`))
})

test('youtubeSessionReady is false with only Google SID', () => {
  assert.equal(
    youtubeSessionReady([
      ['SAPISID', 'abc'],
      ['SID', 'def'],
    ]),
    false,
  )
})

test('youtubeSessionReady is true with LOGIN_INFO', () => {
  assert.equal(
    youtubeSessionReady([
      ['SAPISID', 'abc'],
      ['LOGIN_INFO', faker.string.alphanumeric(8)],
    ]),
    true,
  )
})

test('applySetCookies replaces stale SAPISID and adds LOGIN_INFO', () => {
  const stale = faker.string.alphanumeric(8)
  const fresh = faker.string.alphanumeric(8)
  const loginInfo = faker.string.alphanumeric(10)
  const next = applySetCookies(
    {
      cookies: `SAPISID=${stale}; SID=def`,
      sapisid: stale,
      identity_cookies: 'ACCOUNT_CHOOSER=chooser',
    },
    [
      `SAPISID=${fresh}; Domain=.youtube.com; Secure`,
      `LOGIN_INFO=${loginInfo}; Domain=.youtube.com; Secure; HttpOnly`,
    ],
  )

  assert.equal(next.sapisid, fresh)
  assert.match(next.cookies, new RegExp(`SAPISID=${fresh}`))
  assert.doesNotMatch(next.cookies, new RegExp(`SAPISID=${stale}`))
  assert.match(next.cookies, new RegExp(`LOGIN_INFO=${loginInfo}`))
  assert.equal(next.identity_cookies, 'ACCOUNT_CHOOSER=chooser')
})

test('applySetCookies drops Max-Age=0 and empty values', () => {
  const sapisid = faker.string.alphanumeric(8)
  const next = applySetCookies(
    {
      cookies: `SAPISID=${sapisid}; SID=keep; LOGIN_INFO=stale`,
      sapisid,
    },
    ['SID=; Max-Age=0; Domain=.youtube.com', 'LOGIN_INFO=; Expires=Sat, 10-Feb-2024 00:00:00 GMT'],
  )

  const names = parseCookieHeader(next.cookies).map(([name]) => name)
  assert.equal(names.includes('SID'), false)
  assert.equal(names.includes('LOGIN_INFO'), false)
  assert.match(next.cookies, new RegExp(`SAPISID=${sapisid}`))
})

test('bindYoutubeSession keeps SetSID cookies when the music HTML headers overflow', async () => {
  const stale = faker.string.alphanumeric(8)
  const fresh = faker.string.alphanumeric(8)
  let hops = 0
  const fetchImpl = async () => {
    hops += 1
    if (hops === 1) {
      return {
        status: 302,
        ok: false,
        headers: {
          getSetCookie: () => [],
          get: (name) =>
            name === 'location' ? 'https://accounts.youtube.com/accounts/SetSID' : null,
        },
      }
    }
    if (hops === 2) {
      return {
        status: 302,
        ok: false,
        headers: {
          getSetCookie: () => [
            `SAPISID=${fresh}; Domain=.youtube.com; Secure`,
            'SID=youtube-sid; Domain=.youtube.com',
          ],
          get: (name) => (name === 'location' ? 'https://music.youtube.com/' : null),
        },
      }
    }
    throw Object.assign(new TypeError('fetch failed'), {
      cause: { name: 'HeadersOverflowError' },
    })
  }

  const next = await bindYoutubeSession(
    {
      cookies: `SAPISID=${stale}`,
      sapisid: stale,
      identity_cookies: 'LSID=lsid',
    },
    fetchImpl,
  )

  assert.equal(next.sapisid, fresh)
  assert.match(next.cookies, new RegExp(`SAPISID=${fresh}`))
})

test('handshakeCookieHeader sends identity with the Google SID', () => {
  const header = handshakeCookieHeader({
    cookies: 'SAPISID=abc; SID=def',
    sapisid: 'abc',
    identity_cookies: 'ACCOUNT_CHOOSER=chooser; LSID=lsid',
  })

  assert.match(header, /ACCOUNT_CHOOSER=chooser/)
  assert.match(header, /LSID=lsid/)
  assert.match(header, /SAPISID=abc/)
})

test('bindYoutubeSession mints LOGIN_INFO from music HTML without repeating SetSID', async () => {
  const sapisid = faker.string.alphanumeric(8)
  const loginInfo = faker.string.alphanumeric(10)
  const urls = []
  const fetchImpl = async (url) => {
    urls.push(String(url))
    if (String(url).startsWith('https://music.youtube.com')) {
      return {
        status: 200,
        ok: true,
        headers: {
          getSetCookie: () => [
            `LOGIN_INFO=${loginInfo}; Domain=.youtube.com; Secure; HttpOnly`,
            'VISITOR_INFO1_LIVE=visitor; Domain=.youtube.com',
          ],
          get: () => null,
        },
      }
    }
    throw new Error(`unexpected handshake url ${url}`)
  }

  const next = await bindYoutubeSession(
    {
      cookies: `SAPISID=${sapisid}; SID=youtube-sid`,
      sapisid,
      identity_cookies: 'LSID=lsid',
    },
    fetchImpl,
  )

  assert.match(next.cookies, new RegExp(`LOGIN_INFO=${loginInfo}`))
  assert.match(next.cookies, /VISITOR_INFO1_LIVE=visitor/)
  assert.equal(urls.length, 1)
  assert.match(urls[0], /^https:\/\/music\.youtube\.com\/?$/)
})

test('bindYoutubeSession ignores expired SID from anonymous music HTML', async () => {
  const sapisid = faker.string.alphanumeric(8)
  const fresh = faker.string.alphanumeric(8)
  const loginInfo = faker.string.alphanumeric(10)
  const fetchImpl = async (url) => {
    const href = String(url)
    if (href.startsWith('https://music.youtube.com')) {
      return {
        status: 200,
        ok: true,
        headers: {
          getSetCookie: () => [
            'SID=; Expires=Sat, 10-Feb-2024 00:00:00 GMT; Domain=.youtube.com',
            'SAPISID=; Max-Age=0; Domain=.youtube.com',
          ],
          get: () => null,
        },
      }
    }
    if (href.includes('ServiceLogin')) {
      return {
        status: 302,
        ok: false,
        headers: {
          getSetCookie: () => [],
          get: (name) =>
            name === 'location' ? 'https://accounts.youtube.com/accounts/SetSID' : null,
        },
      }
    }
    if (href.includes('SetSID')) {
      return {
        status: 302,
        ok: false,
        headers: {
          getSetCookie: () => [
            `SAPISID=${fresh}; Domain=.youtube.com; Secure`,
            `LOGIN_INFO=${loginInfo}; Domain=.youtube.com; Secure; HttpOnly`,
          ],
          get: (name) => (name === 'location' ? 'https://music.youtube.com/' : null),
        },
      }
    }
    throw new Error(`unexpected handshake url ${url}`)
  }

  const next = await bindYoutubeSession(
    {
      cookies: `SAPISID=${sapisid}; SID=google-sid`,
      sapisid,
      identity_cookies: 'LSID=lsid',
    },
    fetchImpl,
  )

  assert.equal(next.sapisid, fresh)
  assert.match(next.cookies, new RegExp(`LOGIN_INFO=${loginInfo}`))
  assert.match(next.cookies, new RegExp(`SAPISID=${fresh}`))
})
