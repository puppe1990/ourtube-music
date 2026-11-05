import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { isSafeExternalUrl } from '../src/external.mjs'

faker.seed(21)

test('isSafeExternalUrl accepts the Google device page', () => {
  assert.equal(isSafeExternalUrl('https://www.google.com/device'), true)
  assert.equal(isSafeExternalUrl('https://google.com/device?hl=pt-BR'), true)
})

test('isSafeExternalUrl rejects other hosts', () => {
  const host = faker.internet.domainName()

  assert.equal(isSafeExternalUrl(`https://${host}/device`), false)
})

test('isSafeExternalUrl rejects non-https schemes', () => {
  for (const url of [
    'http://www.google.com/device',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,x',
  ]) {
    assert.equal(isSafeExternalUrl(url), false, url)
  }
})

test('isSafeExternalUrl tolerates garbage input', () => {
  assert.equal(isSafeExternalUrl(''), false)
  assert.equal(isSafeExternalUrl(null), false)
  assert.equal(isSafeExternalUrl('not a url'), false)
})
