import { passkeyClient } from '@better-auth/passkey/client'
import { magicLinkClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  plugins: [twoFactorClient(), passkeyClient(), magicLinkClient()],
})

// Closing the browser's passkey prompt is a choice, not an error worth a toast.
const CANCELLED = new Set(['AUTH_CANCELLED', 'ERROR_CEREMONY_ABORTED'])

export function passkeyCancelled(error: object) {
  return 'code' in error && CANCELLED.has(String(error.code))
}

/** Only same-site relative paths, so `?redirect=` can't become an open redirect. */
export function safePath(path: unknown): string | undefined {
  return typeof path === 'string' &&
    path.startsWith('/') &&
    !/[\t\r\n\\]/.test(path) &&
    new URL(path, 'http://x').host === 'x'
    ? path
    : undefined
}

const NEXT_KEY = 'misri-next'
const NEXT_FOR_MS = 30 * 60 * 1000

/**
 * Where the visitor was heading when sign-in began (an invite, say), kept for
 * half an hour so it survives detours the URL doesn't: two-step checks, the
 * Google round trip, onboarding. Same-browser only.
 */
export function rememberNext(
  path: string,
  store: Storage | undefined = globalThis.localStorage,
) {
  const safe = safePath(path)
  if (!safe || safe === '/' || !store) return
  try {
    store.setItem(NEXT_KEY, JSON.stringify({ path: safe, at: Date.now() }))
  } catch {}
}

/** The remembered destination (once), or undefined when none or stale. */
export function takeNext(
  store: Storage | undefined = globalThis.localStorage,
  now = Date.now(),
) {
  if (!store) return undefined
  try {
    const raw = store.getItem(NEXT_KEY)
    store.removeItem(NEXT_KEY)
    if (!raw) return undefined
    const { path, at } = JSON.parse(raw) as { path?: unknown; at?: number }
    return typeof at === 'number' && now - at < NEXT_FOR_MS
      ? safePath(path)
      : undefined
  } catch {
    return undefined
  }
}
