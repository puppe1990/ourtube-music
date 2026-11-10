export const HOME_CONTINUATION_PAGES = 4

export function mergeHomePages(base = {}, extra = {}) {
  return {
    ...base,
    shelves: [...(base.shelves ?? []), ...(extra.shelves ?? [])],
    continuation: extra.continuation ?? '',
  }
}

export async function followHomeContinuations(
  feed,
  fetchContinuation,
  limit = HOME_CONTINUATION_PAGES,
) {
  let merged = feed ?? { shelves: [], continuation: '' }
  let pages = 0
  const seen = new Set()
  while (merged.continuation && pages < limit) {
    const token = merged.continuation
    if (seen.has(token)) {
      merged = { ...merged, continuation: '' }
      break
    }
    seen.add(token)
    pages += 1
    const next = await fetchContinuation(token)
    merged = mergeHomePages(merged, next)
    if (merged.continuation === token) merged = { ...merged, continuation: '' }
  }
  return merged
}
