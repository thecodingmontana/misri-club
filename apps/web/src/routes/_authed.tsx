import {
  createFileRoute,
  Outlet,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { useRememberDevice } from '#/components/push-device'
import { keepMine } from '#/lib/pwa'
import { claimDevice, last } from '#/lib/session-cache'
import { getSessionFn } from '#/server/auth.functions'
import { getMyCompetitionsFn } from '#/server/competitions.functions'
import { getMyGamesFn } from '#/server/my-games.functions'

// The browser reuses the session it checked for up to five minutes while you
// move around inside the app (Zadaci's pattern), so opening a page doesn't wait
// on a server round trip. Full page loads always check, and every server
// function verifies the session again.
const REUSE_MS = 5 * 60_000

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
    // someone else's offline copies go before anything of theirs is shown
    if (inBrowser && session.user) await claimDevice(session.user.id)
    if (inBrowser && !fresh) last.checked = { at: Date.now(), session }
    if (!session.user) {
      // a visitor arriving at the front door gets the introduction first
      if (location.pathname === '/') throw redirect({ to: '/welcome' })
      throw redirect({
        to: '/auth/signin',
        search: { redirect: location.href },
      })
    }
    // Like Zadaci: nothing else until onboarding is done (name, then chess.com
    // linked or skipped; tracked competitions need no chess.com account).
    if (!session.user.onboarded && location.pathname !== '/onboarding') {
      throw redirect({
        to: '/onboarding',
        search: { redirect: location.href },
      })
    }
    return { user: session.user, isAdmin: session.isAdmin }
  },
  component: Signed,
})

function Signed() {
  useRememberDevice()
  const router = useRouter()
  useEffect(() => {
    void import('#/lib/sync/powersync').then((sync) => sync.startSync())
    // this player's pages, ready for offline
    navigator.serviceWorker?.ready
      .then(() =>
        keepMine(
          getMyCompetitionsFn,
          (path) => router.preloadRoute({ to: path as never }),
          // recent games: Analysis and "your mistakes" puzzles offline
          () => getMyGamesFn(),
        ),
      )
      .catch(() => {})
  }, [router])
  return <Outlet />
}
