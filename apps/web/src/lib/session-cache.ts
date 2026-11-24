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
  if (typeof caches !== 'undefined') {
    void caches.delete('misri-pages-v1').catch(() => {})
  }
  if (typeof window !== 'undefined') {
    void import('#/lib/sync/powersync')
      .then((sync) => sync.stopSync())
      .catch(() => {})
  }
}
