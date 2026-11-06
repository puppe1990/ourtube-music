const LRC_META = /^\[[a-zA-Z]+:/

function lrcTagPattern() {
  return /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
}

export function lyricsAriaLabel(open) {
  return open ? 'Fechar letra' : 'Letra'
}

export function lyricsUnavailable() {
  return 'Letra não disponível'
}

export function parseSyncedLyrics(lrc) {
  const cues = []
  for (const raw of String(lrc ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || LRC_META.test(line)) continue
    const tags = [...line.matchAll(lrcTagPattern())]
    if (!tags.length) continue
    const text = line.replace(lrcTagPattern(), '').trim()
    if (!text) continue
    for (const tag of tags) cues.push({ text, startMs: timestampMs(tag[1], tag[2], tag[3]) })
  }
  return cues.sort((left, right) => left.startMs - right.startMs)
}

export function currentLyricIndex(cues, timeMs) {
  if (!Array.isArray(cues) || cues.length === 0) return -1
  const t = Number(timeMs)
  let current = -1
  for (let i = 0; i < cues.length; i += 1) {
    if (Number(cues[i].startMs) <= t) current = i
  }
  return current
}

export function lyricLineState(index, current) {
  if (index === current) return 'is-current'
  if (current >= 0 && index < current) return 'is-past'
  return 'is-upcoming'
}

export function overlaySyncedLyrics(lyrics, lrc) {
  const cues = parseSyncedLyrics(lrc)
  if (!cues.length) return lyrics
  return {
    lines: cues.map((cue) => cue.text),
    cues,
    source: String(lyrics?.source ?? '').trim() || 'LRCLib',
    message: '',
  }
}

export function shareLyricsText({ title, artist, lines } = {}) {
  const header = [title, artist].map((part) => String(part ?? '').trim()).filter(Boolean)
  const body = (Array.isArray(lines) ? lines : []).map(lineText).filter(Boolean)
  return `${header.join('\n')}\n\n${body.join('\n\n')}`
}

export function renderLyricsHtml(lyrics, timeMs) {
  const cues = Array.isArray(lyrics?.cues) ? lyrics.cues : []
  if (cues.length) {
    const current = currentLyricIndex(cues, timeMs ?? -1)
    return cues
      .map((cue, index) => {
        const text = lineText(cue)
        if (!text) return ''
        const start = Number(cue.startMs) || 0
        return `<p class="${lyricLineState(index, current)}" data-start-ms="${start}">${escapeHtml(text)}</p>`
      })
      .join('')
  }
  const lines = Array.isArray(lyrics?.lines) ? lyrics.lines.map(lineText).filter(Boolean) : []
  if (lines.length === 0) {
    const message = String(lyrics?.message ?? '').trim() || lyricsUnavailable()
    return `<p class="lyrics-empty">${escapeHtml(message)}</p>`
  }
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
}

function lineText(line) {
  if (line && typeof line === 'object') return String(line.text ?? '').trim()
  return String(line ?? '').trim()
}

function timestampMs(minutes, seconds, fraction) {
  const extra = fraction ? Number(String(fraction).padEnd(3, '0').slice(0, 3)) : 0
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + extra
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
