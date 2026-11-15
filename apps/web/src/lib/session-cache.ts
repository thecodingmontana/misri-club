import type { getSessionFn } from '#/server/auth.functions'

type Session = Awaited<ReturnType<typeof getSessionFn>>

/** The last session check, reused by the `_authed` guard for a few minutes. */
export const last: { checked: { at: number; session: Session } | null } = {
  checked: null,
}

/** After signing out or deleting the account: the next page checks again. */
export function forgetSession() {
  last.checked = null
}
