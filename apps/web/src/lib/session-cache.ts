import type { getSessionFn } from '#/server/auth.functions'

type Session = Awaited<ReturnType<typeof getSessionFn>>

/** The last session check, reused by the `_authed` guard for a few minutes. */
export const last: { checked: { at: number; session: Session } | null } = {
  checked: null,
}

/**
 * After signing out or deleting the account: the next page checks again, and
 * the offline copies of this person's pages go (see public/sw.js).
 */
export function forgetSession() {
  last.checked = null
  try {
    localStorage.removeItem('misri-mine-kept-at') // see keepMine in pwa.ts
  } catch {}
  return Promise.all([
    typeof caches !== 'undefined'
      ? caches.delete('misri-pages-v1').catch(() => {})
      : null,
    typeof window !== 'undefined'
      ? import('#/lib/sync/powersync')
          .then((sync) => sync.stopSync())
          .catch(() => {})
      : null,
  ])
}

const DEVICE_USER = 'misri-device-user'

/** Whether this browser's offline copies belong to someone other than `userId`. */
export const ownerChanged = (previous: string | null, userId: string) =>
  previous !== null && previous !== userId

/**
 * A browser's offline copies (pages, synced data, unsent changes) belong to
 * the account that made them. Signing in as someone else, even when the last
 * one's session just expired or was ended elsewhere, wipes them first.
 */
export async function claimDevice(userId: string) {
  let previous: string | null = null
  try {
    previous = localStorage.getItem(DEVICE_USER)
  } catch {}
  if (ownerChanged(previous, userId)) await forgetSession()
  try {
    localStorage.setItem(DEVICE_USER, userId)
  } catch {}
}
