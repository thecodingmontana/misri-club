import { expo } from '@better-auth/expo'
import { passkey } from '@better-auth/passkey'
import { takeAllowance } from '@misri/core/rate-limit'
import { db } from '@misri/db/client'
import * as schema from '@misri/db/schema'
import { generateNanoId } from '@misri/db/utils'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import { generateRandomString } from 'better-auth/crypto'
import { bearer, emailOTP, magicLink, twoFactor } from 'better-auth/plugins'
import type { BetterAuthPlugin } from 'better-auth/types'
import { eq } from 'drizzle-orm'
import { cleanName } from './name.ts'

/**
 * Accounts: Google, an emailed sign-in link (a 6-digit code in the Android
 * app) and passkeys, with optional
 * two-step verification (authenticator app or passkey, plus backup codes).
 * One setup for every app: the web app signs people in (its pages finish the
 * emailed-link and two-step flows); the API checks the same sessions. Sign-in
 * also returns a signed token (`set-auth-token`) that other clients send as
 * `Authorization: Bearer <token>`.
 */

export const SITE_NAME = 'Misri Chess Club'

const TWO_FACTOR_COOKIE_MAX_AGE = 600
const MAGIC_LINK_MINUTES = 10
// shortcut: sized for Resend's free plan (100 a day); raise it with the plan
const MAGIC_LINKS_PER_DAY = 100
const DAY_MS = 24 * 60 * 60 * 1000
const MAGIC_LINKS_PER_HOUR = 5
const FRESH_MINUTES = 10

/** Sign-in emails (links and codes) per address and per day, or a refusal. */
async function limitSignInEmails(email: string) {
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
        'Too many sign-in emails for this address. Use the last one sent, or try again in an hour.',
    })
  }
  // and overall: random addresses from many IPs would still drain the quota
  if (
    !(await takeAllowance('magic-link:all', 1, MAGIC_LINKS_PER_DAY, DAY_MS))
  ) {
    throw new APIError('TOO_MANY_REQUESTS', {
      message:
        'Sign-in emails are paused for today. Try again tomorrow, or continue with Google or a passkey on the website.',
    })
  }
}

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
  const headers = ctx.request?.headers ?? ctx.headers
  const site = headers?.get('sec-fetch-site')
  if (site === 'same-origin') return
  // older browsers send no Fetch Metadata: the Continue click still carries
  // our own page as its referrer, a link from an email or another site doesn't
  if (!site && sameSite(headers?.get('referer'), ctx.context.baseURL)) return
  const query = new URLSearchParams(
    Object.entries((ctx.query ?? {}) as Record<string, string>),
  )
  throw ctx.redirect(`/auth/confirm-sign-in?${query}`)
}

function sameSite(referer: string | null | undefined, base: string) {
  try {
    return (
      Boolean(referer) &&
      new URL(referer as string).origin === new URL(base).origin
    )
  } catch {
    return false
  }
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

/**
 * The Android app, as a passkey ceremony reports its origin: the SHA-256 of
 * the APK's release signing certificate (also in the website's
 * /.well-known/assetlinks.json). Changes only if the signing key does.
 */
export const ANDROID_APP_ORIGIN =
  'android:apk-key-hash:cYz07RxTJU01JA4SGc-CdkXH8RHfJXFWygz4qkSM6ck'

export const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // ID-token sign-in skips the /callback hook below, and with it two-step.
        disableIdTokenSignIn: true,
      }
    : undefined

/** Whether "Continue with Google" can work here (keys set). */
export const googleEnabled = Boolean(google)

const production = process.env.NODE_ENV === 'production'

export interface AuthOptions<P extends BetterAuthPlugin[]> {
  /**
   * Sends the sign-in email; false when it couldn't. Rate limits are checked
   * first. Leave out where nobody signs in (the API): links are then refused.
   */
  sendMagicLink?: (
    email: string,
    url: string,
    minutes: number,
  ) => Promise<boolean>
  /** Sends the app's 6-digit sign-in code; false when it couldn't. */
  sendSignInCode?: (
    email: string,
    code: string,
    minutes: number,
  ) => Promise<boolean>
  /** Account deletion runs this first; without it, deletion is off here. */
  beforeDeleteUser?: (user: { id: string }) => Promise<void>
  /** The app's own plugins, after the shared ones (a cookie plugin goes last). */
  plugins?: P
}

export function createAuth<P extends BetterAuthPlugin[] = []>(
  options: AuthOptions<P> = {},
) {
  const { sendMagicLink, sendSignInCode, beforeDeleteUser } = options
  return betterAuth({
    appName: SITE_NAME,
    secret: requireEnv('BETTER_AUTH_SECRET'),
    // Explicit, so Origin checks and emailed links never trust a request's Host.
    baseURL: production
      ? requireEnv('BETTER_AUTH_URL')
      : process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    // the Android app (apps/mobile), through the Expo plugin below
    trustedOrigins: ['misri://', ANDROID_APP_ORIGIN],
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
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/sign-in/email-otp': { window: 60, max: 5 },
      },
    },
    // A Google sign-in joins an email-link account only when Google says the
    // email is verified; trusting Google outright would skip that check.
    account: { accountLinking: { enabled: true } },
    user: {
      deleteUser: {
        // off unless the app guards it (an owner can't leave others stranded)
        enabled: Boolean(beforeDeleteUser),
        beforeDelete: async (user) => beforeDeleteUser?.(user),
      },
    },
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
              const name = cleanName(user.name)
              if (!name) {
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
              // same rule as a rename; a bad sign-up name falls back to the email's
              name:
                cleanName(user.name) ||
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
        const inApp = ctx.path === '/sign-in/email-otp'
        if (
          !ctx.path.startsWith('/callback/') &&
          ctx.path !== '/magic-link/verify' &&
          !inApp
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
        const expiresAt = new Date(
          Date.now() + TWO_FACTOR_COOKIE_MAX_AGE * 1000,
        )
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
        // the app asks for the code itself; the website has its page
        if (inApp) return ctx.json({ twoFactorRedirect: true, methods })
        // Google or a link opened for the app: back to the app, which sees the
        // two_factor cookie (the Expo plugin's hook adds it to this address)
        const location = ctx.context.responseHeaders?.get('location')
        if (location?.startsWith('misri:')) {
          const back = new URL(location)
          back.searchParams.set('two_factor', methods.join(','))
          ctx.setHeader('location', back.toString())
          return
        }
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
          if (!sendMagicLink) {
            throw new APIError('NOT_FOUND', {
              message: 'Sign in on the Misri website.',
            })
          }
          await limitSignInEmails(email)
          if (await sendMagicLink(email, url, MAGIC_LINK_MINUTES)) return
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
      // "Email me a code", for the Android app: 6 digits, stored hashed,
      // valid 10 minutes, 5 tries; same per-address and daily caps as links
      emailOTP({
        otpLength: 6,
        expiresIn: MAGIC_LINK_MINUTES * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== 'sign-in' || !sendSignInCode) {
            throw new APIError('NOT_FOUND', {
              message: 'Sign in with a code from the Misri app.',
            })
          }
          await limitSignInEmails(email)
          if (await sendSignInCode(email, otp, MAGIC_LINK_MINUTES)) return
          if (
            !process.env.RESEND_API_KEY &&
            process.env.NODE_ENV !== 'production'
          ) {
            console.info(`[auth] sign-in code for ${email}: ${otp}`)
            return
          }
          throw new Error(
            "Couldn't send the sign-in email. Try again in a moment.",
          )
        },
      }),
      // the app's requests: its scheme as their origin, cookies kept on the phone
      expo(),
      // signed tokens only: a session token alone (say, read from a database
      // backup) isn't enough without BETTER_AUTH_SECRET
      bearer({ requireSignature: true }),
      ...((options.plugins ?? []) as P),
    ],
  })
}
