import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { apiSignature, lastFmAuthUrl, lastFmAuthUrlAllowed } from '../src/lastfmSign.mjs'

faker.seed(72)

test('apiSignature is the md5 of sorted key+value pairs plus the secret', () => {
  // Last.fm authspec: omit format/callback, concatenate alphabetically, append secret.
  const params = {
    token: 'yyy',
    api_key: 'xxx',
    method: 'auth.getSession',
    format: 'json',
    callback: faker.internet.username(),
  }

  assert.equal(apiSignature(params, 'zzz'), '75df1fdb6b738160924a52b1732fdde7')
})

test('apiSignature ignores an existing api_sig field', () => {
  const params = {
    api_key: 'xxx',
    method: 'auth.getSession',
    token: 'yyy',
    api_sig: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
  }

  assert.equal(apiSignature(params, 'zzz'), '75df1fdb6b738160924a52b1732fdde7')
})

test('lastFmAuthUrl is the desktop approval page with api_key and token', () => {
  const apiKey = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()
  const token = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()

  assert.equal(
    lastFmAuthUrl(apiKey, token),
    `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`,
  )
})

test('lastFmAuthUrlAllowed only accepts https Last.fm desktop auth URLs', () => {
  const apiKey = faker.string.hexadecimal({ length: 8, prefix: '' }).toLowerCase()
  const token = faker.string.hexadecimal({ length: 8, prefix: '' }).toLowerCase()
  const allowed = lastFmAuthUrl(apiKey, token)

  assert.equal(lastFmAuthUrlAllowed(allowed), true)
  assert.equal(lastFmAuthUrlAllowed('https://last.fm/api/auth/?api_key=x&token=y'), true)
  assert.equal(lastFmAuthUrlAllowed('http://www.last.fm/api/auth/?api_key=x'), false)
  assert.equal(lastFmAuthUrlAllowed('https://www.last.fm/user/x'), false)
  assert.equal(lastFmAuthUrlAllowed(`https://evil.example/api/auth/?api_key=${apiKey}`), false)
  assert.equal(lastFmAuthUrlAllowed('javascript:alert(1)'), false)
})
