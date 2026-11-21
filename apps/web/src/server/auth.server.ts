import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import { generateRandomString } from 'better-auth/crypto'
import { magicLink, twoFactor } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { eq } from 'drizzle-orm'
import { createElement } from 'react'
import { db } from '#/db/client.server'
import * as schema from '#/db/schema'
import { generateNanoId } from '#/db/utils'
import MagicLinkEmail from '#/emails/magic-link'
import { SITE_NAME, SITE_URL } from '#/lib/seo'
import { sendEmail } from './email.server'
import { takeAllowance } from './rate-limit.server'

/**
 * Accounts: Google, an emailed sign-in link and passkeys, with optional
 * two-step verification (authenticator app or passkey, plus backup codes).
 * Same setup as Zadaci's, minus its Supabase-Realtime and AI-agent plugins.
 */

const TWO_FACTOR_COOKIE_MAX_AGE = 600
const MAGIC_LINK_MINUTES = 10
const MAGIC_LINKS_PER_HOUR = 5
const FRESH_MINUTES = 10

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

type AuthContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]

/** Second steps a user has set up: an authenticator app and/or passkeys. */
async function secondFactors(user: {
  id: string
  twoFactorEnabled?: boolean | null
}) {
  const [key] = await db
    .select({ id: schema.passkey.id })
    .from(schema.passkey)
    .where(eq(schema.passkey.userId, user.id))
    .limit(1)
  return [
    ...(user.twoFactorEnabled ? ['totp'] : []),
    ...(key ? ['passkey'] : []),
  ]
}

/**
 * Turning two-step on or off, showing its secret or backup codes, and adding
 * or removing a passkey need a recent sign-in: with no password to ask for, a
 * stolen cookie could otherwise swap the second factor for the thief's own.
 */
const FRESH_ONLY = new Set([
  '/two-factor/enable',
  '/two-factor/disable',
  '/two-factor/generate-backup-codes',
  '/two-factor/get-totp-uri',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/delete-passkey',
  '/delete-user',
])

async function requireFreshSignIn(ctx: AuthContext) {
  const session = await getSessionFromCtx(ctx)
  if (!session) return // the endpoint itself turns signed-out callers away
  const age = Date.now() - new Date(session.session.createdAt).getTime()
  if (age > FRESH_MINUTES * 60_000) {
    throw new APIError('FORBIDDEN', {
      message: `For your security, sign out and back in, then try again within ${FRESH_MINUTES} minutes.`,
    })
  }
}

/**
 * A sign-in link opened from an email app or another site first shows whose
 * account it signs into: otherwise someone could get you to open a link for
 * THEIR account and you would play on it unawares. Continuing from that page is
 * same-origin, which signs in.
 */
function confirmLinkFirst(ctx: AuthContext) {
  const site = (ctx.request?.headers ?? ctx.headers)?.get('sec-fetch-site')
  if (!site || site === 'same-origin') return
  const query = new URLSearchParams(
    Object.entries((ctx.query ?? {}) as Record<string, string>),
  )
  throw ctx.redirect(`/auth/confirm-sign-in?${query}`)
}

/** A picture can only be Google's or none, so nobody points theirs at a tracker. */
function isAllowedPicture(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.googleusercontent.com')
    )
  } catch {
    return false
  }
}

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // ID-token sign-in skips the /callback hook below, and with it two-step.
        disableIdTokenSignIn: true,
      }
    : undefined

/** Whether "Continue with Google" can work here (keys set). */
/**
 * Club admins are the accounts whose verified email is in `ADMIN_EMAILS`
 * (comma-separated). They can manage any competition (see lib/access).
 */
export function isAdminEmail(user: { email: string; emailVerified: boolean }) {
  if (!user.emailVerified) return false
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(user.email.toLowerCase())
}

export const googleEnabled = Boolean(google)

const production = process.env.NODE_ENV === 'production'

export const auth = betterAuth({
  appName: SITE_NAME,
  secret: requireEnv('BETTER_AUTH_SECRET'),
  // Explicit, so Origin checks and emailed links never trust a request's Host.
  baseURL: production
    ? requireEnv('BETTER_AUTH_URL')
    : process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  advanced: {
    database: { generateId: () => generateNanoId() },
    useSecureCookies: production, // HTTPS-only __Secure- cookies
  },
  // counted in Postgres, not each instance's memory, so limits hold on Vercel
  rateLimit: {
    enabled: true,
    storage: 'database',
    // Guessing a 6-digit code or flooding sign-in emails is the attack here.
    customRules: {
      '/two-factor/verify-totp': { window: 60, max: 5 },
      '/two-factor/verify-backup-code': { window: 60, max: 5 },
      '/sign-in/magic-link': { window: 60, max: 3 },
    },
  },
  // A Google sign-in joins an email-link account only when Google says the
  // email is verified; trusting Google outright would skip that check.
  account: { accountLinking: { enabled: true } },
  user: { deleteUser: { enabled: true } },
  databaseHooks: {
    user: {
      update: {
        before: async (user) => {
          const image = (user as { image?: string | null }).image
          if (image && !isAllowedPicture(image)) {
            throw new APIError('BAD_REQUEST', {
              message: 'That picture address is not allowed.',
            })
          }
          // names show on every table and fixture: keep them short and real
          if (typeof user.name === 'string') {
            const name = user.name.trim().replace(/\s+/g, ' ')
            if (name.length < 1 || name.length > 50) {
              throw new APIError('BAD_REQUEST', {
                message: 'Use a name between 1 and 50 characters.',
              })
            }
            return { data: { ...user, name } }
          }
          return { data: user }
        },
      },
      create: {
        // email-link sign-ups arrive without a name: "amina.k@…" → "Amina K"
        before: async (user) => ({
          data: {
            ...user,
            name:
              user.name?.trim() ||
              user.email
                .split('@')[0]
                .split(/[._+-]+/)
                .filter(Boolean)
                .map((word) => word[0].toUpperCase() + word.slice(1))
                .join(' ') ||
              'New player',
          },
        }),
      },
    },
  },
  socialProviders: google ? { google } : {},
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (FRESH_ONLY.has(ctx.path)) return requireFreshSignIn(ctx)
      if (ctx.path === '/magic-link/verify') return confirmLinkFirst(ctx)
    }),
    // Better Auth only asks for the second step after a password sign-in; do
    // the same after Google and after an emailed link, so neither skips it.
    after: createAuthMiddleware(async (ctx) => {
      if (
        !ctx.path.startsWith('/callback/') &&
        ctx.path !== '/magic-link/verify'
      ) {
        return
      }
      const data = ctx.context.newSession
      if (!data) return
      const methods = await secondFactors(data.user)
      if (!methods.length) return

      deleteSessionCookie(ctx, true)
      await ctx.context.internalAdapter.deleteSession(data.session.token)
      ctx.context.setNewSession(null)

      const twoFactorCookie = ctx.context.createAuthCookie('two_factor', {
        maxAge: TWO_FACTOR_COOKIE_MAX_AGE,
      })
      const identifier = `2fa-${generateRandomString(20)}`
      const expiresAt = new Date(Date.now() + TWO_FACTOR_COOKIE_MAX_AGE * 1000)
      await ctx.context.internalAdapter.createVerificationValue({
        value: data.user.id,
        identifier,
        expiresAt,
      })
      // verify-totp counts failed attempts against this record
      await ctx.context.internalAdapter.createVerificationValue({
        value: '0',
        identifier: `2fa-attempts-${identifier}`,
        expiresAt,
      })
      await ctx.setSignedCookie(
        twoFactorCookie.name,
        identifier,
        ctx.context.secret,
        twoFactorCookie.attributes,
      )
      throw ctx.redirect(`/auth/two-factor?methods=${methods.join(',')}`)
    }),
  },
  plugins: [
    twoFactor({
      issuer: SITE_NAME,
      allowPasswordless: true, // nobody here has a password
      twoFactorCookieMaxAge: TWO_FACTOR_COOKIE_MAX_AGE,
    }),
    passkey({ rpName: SITE_NAME }),
    // "Email me a sign-in link": single use, stored hashed, valid 10 minutes
    magicLink({
      expiresIn: MAGIC_LINK_MINUTES * 60,
      storeToken: 'hashed',
      sendMagicLink: async ({ email, url }) => {
        // per address as well as per IP: nobody floods one inbox or our quota
        const allowed = await takeAllowance(
          `magic-link:${email.toLowerCase()}`,
          1,
          MAGIC_LINKS_PER_HOUR,
          60 * 60 * 1000,
        )
        if (!allowed) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message:
              'Too many sign-in links for this email. Use the last one sent, or try again in an hour.',
          })
        }
        const sent = await sendEmail(
          email,
          `Your ${SITE_NAME} sign-in link`,
          createElement(MagicLinkEmail, {
            link: url,
            baseUrl: SITE_URL || new URL(url).origin,
            minutes: MAGIC_LINK_MINUTES,
          }),
        )
        if (sent) return
        // local development without Resend: the link goes to the terminal
        if (
          !process.env.RESEND_API_KEY &&
          process.env.NODE_ENV !== 'production'
        ) {
          console.info(`[auth] sign-in link for ${email}: ${url}`)
          return
        }
        throw new Error(
          "Couldn't send the sign-in email. Try again in a moment.",
        )
      },
    }),
    tanstackStartCookies(), // must stay last
  ],
})
