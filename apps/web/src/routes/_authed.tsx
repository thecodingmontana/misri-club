import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getSessionFn } from '#/server/auth.functions'

// The browser reuses the session it checked for up to five minutes while you
// move around inside the app (Zadaci's pattern), so opening a page doesn't wait
// on a server round trip. Full page loads always check, and every server
// function verifies the session again.
const REUSE_MS = 5 * 60_000

type Session = Awaited<ReturnType<typeof getSessionFn>>

// an object, not a reassigned variable: the route component is code-split
const last: { checked: { at: number; session: Session } | null } = {
  checked: null,
}

/** Every page under `_authed.*` needs a signed-in account. */
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location, cause }) => {
    const inBrowser = typeof window !== 'undefined'
    const fresh =
      inBrowser &&
      cause === 'stay' &&
      last.checked !== null &&
      Date.now() - last.checked.at < REUSE_MS
    const session =
      fresh && last.checked ? last.checked.session : await getSessionFn()
    if (inBrowser && !fresh) last.checked = { at: Date.now(), session }
    if (!session.user) {
      throw redirect({
        to: '/auth/signin',
        search: { redirect: location.href },
      })
    }
    // Like Zadaci: nothing else until onboarding is done (a verified chess.com
    // account is what makes a player's results count).
    if (!session.user.chessUsername && location.pathname !== '/onboarding') {
      throw redirect({
        to: '/onboarding',
        search: { redirect: location.href },
      })
    }
    return { user: session.user, isAdmin: session.isAdmin }
  },
  component: Outlet,
})
