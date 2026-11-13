import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth, googleEnabled } from './auth.server'

/**
 * Club admins are the accounts whose verified email is in `ADMIN_EMAILS`
 * (comma-separated). A bridge until each competition has its own organiser.
 */
function isAdminEmail(user: { email: string; emailVerified: boolean }) {
  if (!user.emailVerified) return false
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(user.email.toLowerCase())
}

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
export const adminMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const user = await currentUser()
    if (!user) throw new Error('Sign in first.')
    if (!isAdminEmail(user)) throw new Error('Only club admins can do that.')
    return next()
  },
)

/** Who is signed in, for the UI. The session token stays in its HttpOnly cookie. */
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await currentUser()
    return {
      user: user && {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
      },
      isAdmin: user ? isAdminEmail(user) : false,
      googleEnabled,
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
