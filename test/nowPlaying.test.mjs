import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { largerCoverUrl, nowPlayingAriaLabel, syncNowPlayingGlyphs } from '../src/nowPlaying.mjs'

faker.seed(42)

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')

test('nowPlayingAriaLabel names expand when the overlay is closed', () => {
  assert.equal(nowPlayingAriaLabel(false), 'Expandir player')
  assert.equal(nowPlayingAriaLabel(true), 'Recolher player')
})

test('largerCoverUrl upgrades the Innertube thumbnail size so the overlay is sharp', () => {
  const id = faker.string.alphanumeric(16)
  const small = `https://lh3.googleusercontent.com/${id}=w60-h60-l90-rj`

  assert.equal(largerCoverUrl(small), `https://lh3.googleusercontent.com/${id}=w544-h544-l90-rj`)
})

test('largerCoverUrl leaves empty and unsized urls alone', () => {
  const plain = faker.image.url()

  assert.equal(largerCoverUrl(''), '')
  assert.equal(largerCoverUrl(undefined), '')
  assert.equal(largerCoverUrl(plain), plain)
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

test('syncNowPlayingGlyphs shows the down triangle only while the overlay is open', () => {
  const up = attributeBag()
  const down = attributeBag(true)

  syncNowPlayingGlyphs(up, down, true)

  assert.equal(up.hasAttribute('hidden'), true)
  assert.equal(down.hasAttribute('hidden'), false)

  syncNowPlayingGlyphs(up, down, false)

  assert.equal(up.hasAttribute('hidden'), false)
  assert.equal(down.hasAttribute('hidden'), true)
})

test('dock keeps an expand control and a hidden now-playing overlay with a large cover', () => {
  const markup = fileURLToPath(new URL('../web/index.html', import.meta.url))

  assert.match(html, /id="expand-player"/, `missing #expand-player in ${markup}`)
  assert.match(html, /aria-label="Expandir player"/)
  assert.match(html, /id="icon-expand"/)
  assert.match(html, /id="icon-collapse"/)
  assert.match(html, /id="now-playing"/)
  assert.match(html, /id="now-playing-art"/)
  assert.match(html, /id="now-playing"[^>]*\bhidden\b/)
})
