import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { chessAccounts } from '#/db/schema'
import { auth, googleEnabled, isAdminEmail } from './auth.server'
import { fetchPlayerProfile } from './chesscom.server'

async function currentUser() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session?.user ?? null
}

/**
 * The security boundary for every mutating server function.
 *
 * Server functions are ordinary HTTP endpoints — reachable whether or not the
 * page that calls them was ever loaded. Hiding a button in the UI is presentation;
 * this middleware is the thing that actually stops an unauthenticated caller.
 */
/** For server functions any signed-in player may call; hands them the user. */
export const userMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const user = await currentUser()
    if (!user) throw new Error('Sign in first.')
    return next({
      context: { user, viewer: { id: user.id, isAdmin: isAdminEmail(user) } },
    })
  },
)

/** Who is signed in, for the UI. The session token stays in its HttpOnly cookie. */
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await currentUser()
    const [chess] = user
      ? await db
          .select({
            username: chessAccounts.username,
            avatar: chessAccounts.avatar,
          })
          .from(chessAccounts)
          .where(eq(chessAccounts.userId, user.id))
          .limit(1)
      : []
    // Linked before chess.com pictures were stored: look it up once, then keep it.
    if (user && chess && chess.avatar === null) {
      const profile = await fetchPlayerProfile(chess.username).catch(() => null)
      if (profile) {
        chess.avatar = profile.avatar ?? ''
        await db
          .update(chessAccounts)
          .set({ avatar: chess.avatar })
          .where(eq(chessAccounts.userId, user.id))
      }
    }
    return {
      user: user && {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
        /** null until onboarding links and verifies a chess.com account */
        chessUsername: chess?.username ?? null,
        /** chess.com picture when they have one */
        chessAvatar: chess?.avatar || null,
      },
      isAdmin: user ? isAdminEmail(user) : false,
      googleEnabled,
      // Read on the server so a collapsed sidebar doesn't flash open on reload.
      sidebarOpen: getCookie('sidebar_state') !== 'false',
    }
  },
)

/**
 * Which email a sign-in link signs into, for the confirm page; null when it is
 * used up or expired. Links are stored as `magic-link:` + base64url(sha256(token)).
 */
export const getSignInLinkEmailFn = createServerFn({ method: 'GET' })
  .validator((token: unknown) =>
    typeof token === 'string' ? token.slice(0, 200) : '',
  )
  .handler(async ({ data: token }) => {
    if (!token) return null
    const { createHash } = await import('node:crypto')
    const { and, eq, gt } = await import('drizzle-orm')
    const { db } = await import('#/db/client.server')
    const { verification } = await import('#/db/schema')
    const hashed = createHash('sha256').update(token).digest('base64url')
    const [row] = await db
      .select({ value: verification.value })
      .from(verification)
      .where(
        and(
          eq(verification.identifier, `magic-link:${hashed}`),
          gt(verification.expiresAt, new Date()),
        ),
      )
    try {
      return (JSON.parse(row?.value ?? '') as { email?: string }).email ?? null
    } catch {
      return null
    }
  })
