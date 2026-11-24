import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { auth } from './auth.server'

// Signing in to the Misri app: the app opens the website, the player says yes
// there (signed in any way the site offers), and the app gets a one-time code
// back through its link (misri://auth). Only the app that started (holding the
// PKCE verifier) can trade that code for a session of its own.

const CODE_MS = 2 * 60 * 1000
const key = (code: string) => `app-code:${code}`

/** A short-lived, single-use code for this player, bound to the app's challenge. */
export async function issueAppCode(userId: string, challenge: string) {
  const code = randomBytes(24).toString('base64url')
  const ctx = await auth.$context
  await ctx.internalAdapter.createVerificationValue({
    identifier: key(code),
    value: JSON.stringify({ userId, challenge }),
    expiresAt: new Date(Date.now() + CODE_MS),
  })
  return code
}

/** The app's own signed session token, or null for a used, expired or wrong code. */
export async function redeemAppCode(code: string, verifier: string) {
  const ctx = await auth.$context
  // used up whatever happens next: a code is tried once
  const row = await ctx.internalAdapter.consumeVerificationValue(key(code))
  if (!row || row.expiresAt.getTime() < Date.now()) return null
  const { userId, challenge } = JSON.parse(row.value) as {
    userId: string
    challenge: string
  }
  if (!sameText(pkce(verifier), challenge)) return null
  const session = await ctx.internalAdapter.createSession(userId)
  // signed like the session cookie, as the bearer plugin requires
  const signature = createHmac('sha256', ctx.secret)
    .update(session.token)
    .digest('base64')
  return `${session.token}.${signature}`
}

/** PKCE S256: base64url(sha256(verifier)). */
export const pkce = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url')

function sameText(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
