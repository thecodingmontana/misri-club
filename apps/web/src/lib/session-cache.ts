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
  if (claimed) {
    claimed = false
    claim = new Promise<void>((done) => {
      markClaimed = done
    })
  }
  try {
    localStorage.removeItem('misri-mine-kept-at') // see keepMine in pwa.ts
  } catch {}
  // true when both went; never throws, so callers needn't wait or catch
  return Promise.all([
    typeof caches !== 'undefined'
      ? caches.delete('misri-pages-v1').then(
          () => true,
          () => false,
        )
      : true,
    typeof window !== 'undefined'
      ? import('#/lib/sync/powersync')
          .then((sync) => sync.stopSync())
          .then(
            () => true,
            () => false,
          )
      : true,
  ]).then((done) => done.every(Boolean))
}

const DEVICE_USER = 'misri-device-user'

// set once this page has checked the browser's copies belong to who's signed in
let claimed = false
export const deviceClaimed = () => claimed
let markClaimed = () => {}
let claim = new Promise<void>((done) => {
  markClaimed = done
})
/** Resolves once the browser's copies are known to be the signed-in account's. */
export const whenClaimed = () => claim

/** Whether this browser's offline copies belong to someone other than `userId`. */
export const ownerChanged = (previous: string | null, userId: string) =>
  previous !== null && previous !== userId

/**
 * A browser's offline copies (pages, synced data, unsent changes) belong to
 * the account that made them. Signing in as someone else, even when the last
 * one's session just expired or was ended elsewhere, wipes them first.
 */
export async function claimDevice(userId: string): Promise<boolean> {
  let previous: string | null = null
  try {
    previous = localStorage.getItem(DEVICE_USER)
  } catch {}
  // the new owner is written only once the last one's copies are gone, so a
  // wipe that failed is tried again on the next page
  if (ownerChanged(previous, userId) && !(await forgetSession())) return false
  try {
    localStorage.setItem(DEVICE_USER, userId)
  } catch {}
  claimed = true
  markClaimed()
  return true
}
