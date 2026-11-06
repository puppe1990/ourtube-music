import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { playPauseAriaLabel, playbackSource, syncPlayPauseIcons } from '../src/playback.mjs'

faker.seed(18)

function stream(overrides = {}) {
  return {
    audioUrl: faker.internet.url(),
    mimeType: 'audio/mp4; codecs="mp4a.40.2"',
    itag: 140,
    bitrate: 131000,
    fallbackUrl: faker.internet.url(),
    fallbackMime: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
    fallbackItag: 18,
    ...overrides,
  }
}

test('playback prefers progressive muxed MP4 so <audio> can decode it', () => {
  // Adaptive itag 140 is ftypdash; WKWebView rejects it. itag 18 is ftypmp42.
  const item = stream()

  const source = playbackSource(item)

  assert.equal(source.url, item.fallbackUrl)
  assert.equal(source.mimeType, item.fallbackMime)
  assert.equal(source.itag, 18)
})

test('playback keeps the Opus stream when the caller asks for webm', () => {
  const item = stream()

  const source = playbackSource(item, 'webm')

  assert.equal(source.url, item.audioUrl)
  assert.equal(source.mimeType, item.mimeType)
  assert.equal(source.itag, 140)
})

test('playback falls back to adaptive audio when there is no muxed format', () => {
  const item = stream({ fallbackUrl: '', fallbackMime: '', fallbackItag: 0 })

  const source = playbackSource(item)

  assert.equal(source.url, item.audioUrl)
  assert.equal(source.itag, 140)
})

function attributeBag(hidden = false) {
  const attrs = new Set()
  if (hidden) attrs.add('hidden')
  return {
    toggleAttribute(name, force) {
      if (force) attrs.add(name)
      else attrs.delete(name)
    },
    hasAttribute(name) {
      return attrs.has(name)
    },
  }
}

test('syncPlayPauseIcons hides play via the hidden attribute while audio is playing', () => {
  // SVGElement has no HTMLElement.hidden IDL; WKWebView ignores svg.hidden = true.
  const playEl = attributeBag()
  const pauseEl = attributeBag(true)

  syncPlayPauseIcons(playEl, pauseEl, true)

  assert.equal(playEl.hasAttribute('hidden'), true)
  assert.equal(pauseEl.hasAttribute('hidden'), false)
})

test('syncPlayPauseIcons restores the play glyph when audio is paused', () => {
  const playEl = attributeBag(true)
  const pauseEl = attributeBag()

  syncPlayPauseIcons(playEl, pauseEl, false)

  assert.equal(playEl.hasAttribute('hidden'), false)
  assert.equal(pauseEl.hasAttribute('hidden'), true)
})

test('playPauseAriaLabel names the action the dock button will perform', () => {
  assert.equal(playPauseAriaLabel(true), 'Pausar')
  assert.equal(playPauseAriaLabel(false), 'Tocar')
})
