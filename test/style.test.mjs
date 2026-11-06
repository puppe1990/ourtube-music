import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const css = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8')

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(
    match,
    `missing ${selector} in ${fileURLToPath(new URL('../web/style.css', import.meta.url))}`,
  )
  return match[1]
}

test('shelf-rail is a single-row horizontal scroller so covers stay in view', () => {
  const body = cssRule('.shelf-rail')

  assert.match(body, /display:\s*flex/)
  assert.match(body, /flex-wrap:\s*nowrap/)
  assert.match(body, /overflow-x:\s*auto/)
  assert.match(body, /overflow-y:\s*hidden/)
  assert.doesNotMatch(body, /grid-auto-flow:\s*column/)
})

test('library shelf-grid wraps mixed covers instead of scrolling sideways', () => {
  const body = cssRule('.shelf-grid')

  assert.match(body, /display:\s*flex/)
  assert.match(body, /flex-wrap:\s*wrap/)
})

test('library artist cards crop the cover into a circle', () => {
  const body = cssRule('.card-circle .card-art')

  assert.match(body, /border-radius:\s*50%/)
})

test('shelf cards keep a fixed column width so the rail cannot stack them', () => {
  const body = cssRule('.shelf-rail > .card')

  assert.match(body, /flex:\s*0 0 168px/)
  assert.match(body, /width:\s*168px/)
})

test('brand mark is a crimson tile with a white play glyph', () => {
  const mark = cssRule('.brand-mark')

  assert.match(mark, /background:\s*var\(--red\)/)
  assert.match(mark, /color:\s*var\(--on-red\)/)
  assert.match(cssRule('.brand-name b'), /color:\s*var\(--red\)/)
})

test('rail items keep a 6px pip and the current one is crimson', () => {
  const pip = cssRule('.rail-nav a::before')
  const current = cssRule(".rail-nav a[aria-current='true']::before")

  assert.match(pip, /width:\s*6px/)
  assert.match(pip, /height:\s*6px/)
  assert.match(current, /background:\s*var\(--red\)/)
  assert.match(current, /box-shadow:\s*0 0 0 4px var\(--red-soft\)/)
})

test('small crimson marks sit on the liked glyph, play discs and account', () => {
  assert.match(cssRule('.rail-glyph-red'), /background:\s*var\(--red\)/)
  assert.match(cssRule('.card-play'), /background:\s*var\(--red\)/)
  assert.match(cssRule('.quick-play'), /background:\s*var\(--red\)/)
  assert.match(cssRule(".heart[aria-pressed='true']"), /color:\s*var\(--red\)/)
  assert.match(cssRule(".account[data-logged-in='true']"), /border-color:\s*var\(--red\)/)
})

test('last.fm rail button uses the crimson connected mark', () => {
  const button = cssRule('.lastfm')

  assert.match(button, /min-height:\s*40px/)
  assert.match(cssRule(".lastfm[data-connected='true']"), /border-color:\s*var\(--red\)/)
})

test('dock repeat and shuffle light up crimson when active', () => {
  assert.match(cssRule(".repeat[data-mode='all']"), /color:\s*var\(--red\)/)
  assert.match(cssRule(".repeat[data-mode='one']"), /color:\s*var\(--red\)/)
  assert.match(cssRule(".shuffle[aria-pressed='true']"), /color:\s*var\(--red\)/)
})

test('expand-player is a dark circle with a white up-triangle', () => {
  const button = cssRule('.expand-player')

  assert.match(button, /border-radius:\s*50%/)
  assert.match(button, /background:\s*var\(--surface-3\)/)
  assert.match(button, /color:\s*var\(--on-red\)/)
})

test('now-playing overlay covers the canvas above the dock with a large cover', () => {
  const overlay = cssRule('.now-playing')
  const art = cssRule('.now-playing-art')

  assert.match(overlay, /position:\s*absolute/)
  assert.match(overlay, /inset:\s*0 0 var\(--dock\) 0/)
  assert.match(art, /width:\s*min\(/)
  assert.match(art, /aspect-ratio:\s*1/)
})

test('lyrics sheet covers the canvas above the dock with large centered lines', () => {
  const overlay = cssRule('.lyrics')
  const lines = cssRule('.lyrics-lines')

  assert.match(overlay, /position:\s*absolute/)
  assert.match(overlay, /inset:\s*0 0 var\(--dock\) 0/)
  assert.match(lines, /text-align:\s*center/)
  assert.match(lines, /font-size:\s*28px/)
})

test('karaoke current line is white while past and upcoming stay dim', () => {
  const current = cssRule('.lyrics-lines p.is-current')
  const past = cssRule('.lyrics-lines p.is-past')
  const upcoming = cssRule('.lyrics-lines p.is-upcoming')

  assert.match(current, /color:\s*#ededed/)
  assert.match(past, /rgba\(237,\s*237,\s*237,\s*0\.28\)/)
  assert.match(upcoming, /rgba\(237,\s*237,\s*237,\s*0\.48\)/)
})
