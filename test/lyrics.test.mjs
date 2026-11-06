import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  currentLyricIndex,
  lyricLineState,
  lyricsAriaLabel,
  lyricsUnavailable,
  overlaySyncedLyrics,
  parseSyncedLyrics,
  renderLyricsHtml,
  shareLyricsText,
} from '../src/lyrics.mjs'

faker.seed(77)

function lrcTag(startMs) {
  const minutes = String(Math.floor(startMs / 60_000)).padStart(2, '0')
  const seconds = String(Math.floor((startMs % 60_000) / 1000)).padStart(2, '0')
  const hundredths = String(Math.floor((startMs % 1000) / 10)).padStart(2, '0')
  return `[${minutes}:${seconds}.${hundredths}]`
}

function fakeCue() {
  const text = faker.lorem.sentence({ min: 3, max: 8 })
  const startMs = faker.number.int({ min: 0, max: 240_000 })
  return { text, startMs }
}

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')

test('lyricsAriaLabel names the dock control for the sheet', () => {
  assert.equal(lyricsAriaLabel(false), 'Letra')
  assert.equal(lyricsAriaLabel(true), 'Fechar letra')
})

test('shareLyricsText stacks title, artist and the lyric lines', () => {
  const title = faker.music.songName()
  const artist = faker.music.artist()
  const lines = [faker.lorem.sentence(), faker.lorem.sentence()]

  assert.equal(
    shareLyricsText({ title, artist, lines }),
    `${title}\n${artist}\n\n${lines.join('\n\n')}`,
  )
})

test('renderLyricsHtml paints each line as a paragraph and the empty state as a message', () => {
  const line = faker.lorem.sentence()
  const message = faker.lorem.sentence()

  assert.match(renderLyricsHtml({ lines: [line], message: '' }), new RegExp(`<p>${line}</p>`))
  assert.match(renderLyricsHtml({ lines: [], message }), /class="lyrics-empty"/)
  assert.match(renderLyricsHtml({ lines: [], message }), new RegExp(message))
})

test('lyricsUnavailable is the Portuguese empty copy', () => {
  assert.equal(lyricsUnavailable(), 'Letra não disponível')
})

test('dock keeps a lyrics control and a hidden Letra sheet with share', () => {
  const markup = fileURLToPath(new URL('../web/index.html', import.meta.url))

  assert.match(html, /id="open-lyrics"/, `missing #open-lyrics in ${markup}`)
  assert.match(html, /id="lyrics"/)
  assert.match(html, /id="lyrics"[^>]*\bhidden\b/)
  assert.match(html, />Letra</)
  assert.match(html, /id="close-lyrics"/)
  assert.match(html, /id="lyrics-lines"/)
  assert.match(html, /id="share-lyrics"/)
  assert.match(html, /Compartilhar/)
})

test('parseSyncedLyrics turns LRC timestamps into startMs cues and skips empty lines', () => {
  const first = fakeCue()
  const second = { text: faker.lorem.sentence({ min: 3, max: 8 }), startMs: first.startMs + 4_320 }
  const lrc = [
    `[ar:${faker.music.artist()}]`,
    `${lrcTag(first.startMs)} ${first.text}`,
    `${lrcTag(second.startMs)}`,
    `${lrcTag(second.startMs + 1_110)} ${second.text}`,
  ].join('\n')

  assert.deepEqual(parseSyncedLyrics(lrc), [
    { text: first.text, startMs: first.startMs - (first.startMs % 10) },
    { text: second.text, startMs: second.startMs + 1_110 - ((second.startMs + 1_110) % 10) },
  ])
})

test('parseSyncedLyrics duplicates a line that carries more than one timestamp', () => {
  const text = faker.lorem.words({ min: 2, max: 5 })
  const firstMs = 12_000
  const secondMs = 97_340

  assert.deepEqual(parseSyncedLyrics(`${lrcTag(firstMs)}${lrcTag(secondMs)} ${text}`), [
    { text, startMs: firstMs },
    { text, startMs: secondMs },
  ])
})

test('currentLyricIndex is the last cue that has already started', () => {
  const cues = [
    { text: faker.lorem.word(), startMs: 1_000 },
    { text: faker.lorem.word(), startMs: 4_000 },
    { text: faker.lorem.word(), startMs: 9_000 },
  ]

  assert.equal(currentLyricIndex(cues, 0), -1)
  assert.equal(currentLyricIndex(cues, 1_000), 0)
  assert.equal(currentLyricIndex(cues, 3_999), 0)
  assert.equal(currentLyricIndex(cues, 4_000), 1)
  assert.equal(currentLyricIndex(cues, 20_000), 2)
  assert.equal(currentLyricIndex([], 1_000), -1)
})

test('lyricLineState dims past and upcoming lines around the sung one', () => {
  assert.equal(lyricLineState(0, -1), 'is-upcoming')
  assert.equal(lyricLineState(0, 1), 'is-past')
  assert.equal(lyricLineState(1, 1), 'is-current')
  assert.equal(lyricLineState(2, 1), 'is-upcoming')
})

test('renderLyricsHtml stamps timed cues with data-start-ms and karaoke classes', () => {
  const cues = [
    { text: faker.lorem.sentence(), startMs: 1_110 },
    { text: faker.lorem.sentence(), startMs: 4_440 },
    { text: faker.lorem.sentence(), startMs: 8_880 },
  ]

  const html = renderLyricsHtml({ cues, lines: cues.map((cue) => cue.text) }, 4_440)

  assert.match(html, new RegExp(`data-start-ms="${cues[0].startMs}"`))
  assert.match(html, /class="is-past"/)
  assert.match(html, /class="is-current"/)
  assert.match(html, /class="is-upcoming"/)
  assert.match(html, new RegExp(`>${cues[1].text}</p>`))
})

test('shareLyricsText reads .text off cue objects', () => {
  const title = faker.music.songName()
  const artist = faker.music.artist()
  const cues = [fakeCue(), fakeCue()]

  assert.equal(
    shareLyricsText({ title, artist, lines: cues }),
    `${title}\n${artist}\n\n${cues.map((cue) => cue.text).join('\n\n')}`,
  )
})

test('overlaySyncedLyrics replaces the static sheet with timed LRC cues', () => {
  const staticLine = faker.lorem.sentence()
  const cue = fakeCue()
  const overlaid = overlaySyncedLyrics(
    { lines: [staticLine], source: 'Musixmatch', message: lyricsUnavailable() },
    `${lrcTag(cue.startMs)} ${cue.text}`,
  )

  assert.deepEqual(overlaid.cues, [{ text: cue.text, startMs: cue.startMs - (cue.startMs % 10) }])
  assert.deepEqual(overlaid.lines, [cue.text])
  assert.equal(overlaid.source, 'Musixmatch')
  assert.equal(overlaid.message, '')
})

test('overlaySyncedLyrics keeps the Innertube sheet when LRC is empty', () => {
  const lyrics = { lines: [faker.lorem.sentence()], source: 'Musixmatch', message: '' }

  assert.equal(overlaySyncedLyrics(lyrics, ''), lyrics)
})
