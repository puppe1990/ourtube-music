export const AUTH_COOKIE_NAMES = [
  'SID',
  'HSID',
  'SSID',
  'APISID',
  'SAPISID',
  '__Secure-1PSID',
  '__Secure-3PSID',
  '__Secure-1PAPISID',
  '__Secure-3PAPISID',
  '__Secure-1PSIDTS',
  '__Secure-3PSIDTS',
  'SIDCC',
  '__Secure-1PSIDCC',
  '__Secure-3PSIDCC',
  'VISITOR_INFO1_LIVE',
  'VISITOR_PRIVACY_METADATA',
  'PREF',
  'YSC',
  '__Secure-YEC',
  'LOGIN_INFO',
]

export const IDENTITY_COOKIE_NAMES = [
  'ACCOUNT_CHOOSER',
  'LSID',
  '__Host-GAPS',
  '__Host-1PLSID',
  '__Host-3PLSID',
]

export const YOUTUBE_CONTINUE_URL =
  'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F'

export const MUSIC_ORIGIN_URL = 'https://music.youtube.com/'

export function parseCookieHeader(header) {
  if (!header) return []
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const cut = part.indexOf('=')
      if (cut <= 0) return []
      return [[part.slice(0, cut), part.slice(cut + 1)]]
    })
}

export function cookieHeader(pairs) {
  const seen = new Set()
  const header = []
  for (const [name, value] of pairs) {
    if (!AUTH_COOKIE_NAMES.includes(name) || seen.has(name) || !value) continue
    seen.add(name)
    header.push(`${name}=${value}`)
  }
  return header.join('; ')
}

export function identityCookieHeader(pairs) {
  const header = []
  for (const name of IDENTITY_COOKIE_NAMES) {
    const match = pairs.find(([cookieName, value]) => cookieName === name && value)
    if (match) header.push(`${name}=${match[1]}`)
  }
  return header.join('; ')
}

export function youtubeSessionReady(pairs) {
  return pairs.some(
    ([name, value]) => (name === 'LOGIN_INFO' || name === 'VISITOR_INFO1_LIVE') && Boolean(value),
  )
}

export function sessionIsYoutubeBound(auth) {
  return youtubeSessionReady(parseCookieHeader(auth?.cookies ?? ''))
}

export function handshakeCookieHeader(auth) {
  return [auth?.identity_cookies, auth?.cookies].filter(Boolean).join('; ')
}

export function applySetCookies(auth, setCookies) {
  const innertube = Object.fromEntries(parseCookieHeader(auth?.cookies ?? ''))
  const identity = Object.fromEntries(parseCookieHeader(auth?.identity_cookies ?? ''))
  for (const line of setCookies) {
    const parsed = parseSetCookie(line)
    if (!parsed) continue
    const { name, value, expired } = parsed
    const target = IDENTITY_COOKIE_NAMES.includes(name)
      ? identity
      : AUTH_COOKIE_NAMES.includes(name)
        ? innertube
        : null
    if (!target) continue
    if (expired || !value) delete target[name]
    else target[name] = value
  }
  const innertubePairs = Object.entries(innertube)
  return {
    ...auth,
    cookies: cookieHeader(innertubePairs),
    sapisid: innertube.SAPISID || innertube['__Secure-3PAPISID'] || auth?.sapisid || '',
    identity_cookies: identityCookieHeader(Object.entries(identity)),
  }
}

function parseSetCookie(line) {
  const attrs = String(line)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
  if (attrs.length === 0) return null
  const cut = attrs[0].indexOf('=')
  if (cut <= 0) return null
  const name = attrs[0].slice(0, cut)
  const value = attrs[0].slice(cut + 1)
  let expired = value.length === 0
  for (const attr of attrs.slice(1)) {
    const sep = attr.indexOf('=')
    const key = (sep < 0 ? attr : attr.slice(0, sep)).trim()
    const attrValue = sep < 0 ? '' : attr.slice(sep + 1).trim()
    if (key.toLowerCase() === 'max-age' && Number(attrValue) <= 0) expired = true
  }
  return { name, value, expired }
}

function handshakeHeaders(auth) {
  return {
    cookie: handshakeCookieHeader(auth),
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
    accept: 'text/html',
  }
}

function setCookieLines(response) {
  return typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
}

function setCookiesIncludeLoginInfo(setCookies) {
  return setCookies.some((line) => {
    const parsed = parseSetCookie(line)
    return Boolean(parsed && parsed.name === 'LOGIN_INFO' && parsed.value && !parsed.expired)
  })
}

async function mintLoginInfo(auth, fetchImpl) {
  let response
  try {
    response = await fetchImpl(MUSIC_ORIGIN_URL, {
      method: 'GET',
      redirect: 'manual',
      headers: handshakeHeaders(auth),
    })
  } catch (_error) {
    // undici overflows on this HTML; browse already works with the SetSID SID.
    return auth
  }
  const setCookies = setCookieLines(response)
  if (!setCookiesIncludeLoginInfo(setCookies)) return auth
  return applySetCookies(auth, setCookies)
}

export async function bindYoutubeSession(auth, fetchImpl = fetch) {
  if (sessionIsYoutubeBound(auth)) return auth
  const minted = await mintLoginInfo(auth, fetchImpl)
  if (sessionIsYoutubeBound(minted)) return minted
  let url = YOUTUBE_CONTINUE_URL
  let current = { ...minted }
  for (let hop = 0; hop < 8; hop += 1) {
    let response
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers: handshakeHeaders(current),
      })
    } catch (error) {
      // music.youtube.com HTML overflows undici's 16 KB header cap; SetSID
      // already minted the YouTube SID on the previous hop (probed 2026-11-06).
      if (hop > 0) return mintLoginInfo(current, fetchImpl)
      throw error
    }
    const setCookies = setCookieLines(response)
    current = applySetCookies(current, setCookies)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        throw new Error(`youtube SetSID HTTP ${response.status} missing Location`)
      }
      url = new URL(location, url).toString()
      if (new URL(url).hostname === 'music.youtube.com') {
        return mintLoginInfo(current, fetchImpl)
      }
      continue
    }
    if (!response.ok) {
      throw new Error(`youtube SetSID returned HTTP ${response.status}`)
    }
    break
  }
  return mintLoginInfo(current, fetchImpl)
}
