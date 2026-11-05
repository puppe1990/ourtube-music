const ALLOWED_HOSTS = new Set(['google.com', 'www.google.com'])

export function isSafeExternalUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return false
  let parsed
  try {
    parsed = new URL(url)
  } catch (_error) {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  return ALLOWED_HOSTS.has(parsed.hostname)
}
