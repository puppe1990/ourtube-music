/// Innertube thumbs ship as w60; the expanded player needs a sharp square.
export function largerCoverUrl(url) {
  const src = String(url ?? '').trim()
  if (!src) return ''
  return src.replace(/=w\d+-h\d+/, '=w544-h544')
}

export function nowPlayingAriaLabel(open) {
  return open ? 'Recolher player' : 'Expandir player'
}

/// SVG glyphs in WKWebView ignore the HTMLElement.hidden IDL; toggle the
/// content attribute so `[hidden] { display: none }` actually applies.
export function syncNowPlayingGlyphs(upEl, downEl, open) {
  upEl.toggleAttribute('hidden', open)
  downEl.toggleAttribute('hidden', !open)
}
