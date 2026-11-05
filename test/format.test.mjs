import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { formatBitrate, formatDuration, shorten } from '../src/format.mjs'

faker.seed(42)

test('formatDuration renders mm:ss under an hour', () => {
  const seconds = faker.number.int({ min: 60, max: 3599 })

  const rendered = formatDuration(seconds)

  const minutes = Math.floor(seconds / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  assert.equal(rendered, `${minutes}:${rest}`)
})

test('formatDuration renders h:mm:ss past an hour', () => {
  const seconds = faker.number.int({ min: 3600, max: 9000 })

  const rendered = formatDuration(seconds)

  const hours = Math.floor(seconds / 3600)
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const rest = String(seconds % 60).padStart(2, '0')
  assert.equal(rendered, `${hours}:${minutes}:${rest}`)
})

test('formatDuration is empty for missing or invalid values', () => {
  assert.equal(formatDuration(undefined), '')
  assert.equal(formatDuration(0), '0:00')
  assert.equal(formatDuration(-5), '')
  assert.equal(formatDuration('213'), '3:33')
})

test('formatBitrate rounds to whole kbps', () => {
  const bitrate = faker.number.int({ min: 50000, max: 320000 })

  assert.equal(formatBitrate(bitrate), `${Math.round(bitrate / 1000)} kbps`)
  assert.equal(formatBitrate(0), '')
})

test('shorten keeps short text and ellipsizes long text', () => {
  const word = faker.lorem.word()

  assert.equal(shorten(word, 120), word)
  assert.equal(shorten('abcdefghij', 4), 'abcd…')
  assert.equal(shorten('', 10), '')
})
