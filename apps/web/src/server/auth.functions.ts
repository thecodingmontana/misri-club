import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { chessAccounts, user as userTable } from '#/db/schema'
import { perform } from './api-client.server'
import { auth, googleEnabled, isAdminEmail } from './auth.server'
import { fetchPlayerProfile } from './chesscom.server'

async function currentSession() {
  return auth.api.getSession({ headers: getRequestHeaders() })
}

async function currentUser() {
  return (await currentSession())?.user ?? null
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
    const session = await currentSession()
    if (!session) throw new Error('Sign in first.')
    const { user } = session
    return next({
      context: {
        user,
        viewer: {
          id: user.id,
          isAdmin: isAdminEmail(user),
          sessionId: session.session.id,
        },
      },
    })
  },
)

/** Who is signed in, for the UI. The session token stays in its HttpOnly cookie. */
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await currentUser()
    const [row] = user
      ? await db
          .select({
            username: chessAccounts.username,
            avatar: chessAccounts.avatar,
            onboardedAt: userTable.onboardedAt,
          })
          .from(userTable)
          .leftJoin(chessAccounts, eq(chessAccounts.userId, userTable.id))
          .where(eq(userTable.id, user.id))
          .limit(1)
      : []
    const chess = row?.username
      ? { username: row.username, avatar: row.avatar }
      : undefined
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
        /** done with onboarding: linked chess.com, or chose to skip it */
        onboarded: Boolean(chess || row?.onboardedAt),
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

/** Onboarding without chess.com: they can link it later from their account. */
export const skipChessFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(({ context }) => perform('skipOnboarding', context.viewer, {}))
