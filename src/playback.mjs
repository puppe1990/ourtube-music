/// Picks the googlevideo URL that a bare `<audio>` element can actually
/// decode. Adaptive itag 140 is DASH (`ftypdash`) and WKWebView rejects it;
/// ANDROID itag 18 is progressive (`ftypmp42`, probed 2026-11-05).
export function playbackSource(stream, variant) {
  if (variant === 'webm') {
    return { url: stream.audioUrl, mimeType: stream.mimeType, itag: stream.itag }
  }
  if (variant === 'muxed' || stream.fallbackUrl) {
    return {
      url: stream.fallbackUrl || stream.audioUrl,
      mimeType: stream.fallbackMime || stream.mimeType,
      itag: stream.fallbackItag || stream.itag,
    }
  }
  return { url: stream.audioUrl, mimeType: stream.mimeType, itag: stream.itag }
}

/// SVG glyphs in WKWebView ignore the HTMLElement.hidden IDL; toggle the
/// content attribute so `[hidden] { display: none }` actually applies.
export function syncPlayPauseIcons(playEl, pauseEl, playing) {
  playEl.toggleAttribute('hidden', playing)
  pauseEl.toggleAttribute('hidden', !playing)
}

export function playPauseAriaLabel(playing) {
  return playing ? 'Pausar' : 'Tocar'
}
