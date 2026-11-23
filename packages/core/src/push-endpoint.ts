// Browsers only issue push endpoints on these hosts; anything else would make
// the server POST wherever a user pointed it.
export const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
]

/** True for an https URL on a real browser push service. */
export function isPushEndpoint(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password || parsed.port) return false
  const host = parsed.hostname.toLowerCase()
  return PUSH_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  )
}
