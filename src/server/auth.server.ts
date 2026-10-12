import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { getRequestIP, useSession } from '@tanstack/react-start/server'

/**
 * Admin authentication: a single shared passphrase, verified against a scrypt
 * hash held in `ADMIN_PASSWORD_HASH`, exchanged for an encrypted session cookie.
 *
 * Consequences of the shared-secret model, stated plainly:
 *  - There is no per-admin attribution. The audit trail can say "an admin
 *    regenerated fixtures", never which one.
 *  - Rotating the passphrase signs everyone out at once (by design — the
 *    session-sealing key is derived from the hash, so a new passphrase
 *    invalidates every outstanding cookie).
 *
 * scrypt comes from `node:crypto`, so there is no native addon to compile.
 */

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 } as const

const SESSION_NAME = 'misri_admin'
const SESSION_MAX_AGE = 60 * 60 * 12 // 12 hours

export class NotConfiguredError extends Error {
  constructor() {
    super(
      'Admin access is not configured. Run `pnpm auth:set-password` and put the printed ADMIN_PASSWORD_HASH line in your .env file.',
    )
    this.name = 'NotConfiguredError'
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Admin sign-in required.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

/** `scrypt$N$r$p$saltHex$keyHex` — parameters travel with the hash. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const { N, r, p, keylen } = SCRYPT_PARAMS
  const key = scryptSync(password.normalize('NFKC'), salt, keylen, { N, r, p })

  return [
    'scrypt',
    N,
    r,
    p,
    salt.toString('hex'),
    key.toString('hex'),
  ].join('$')
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, N, r, p, saltHex, keyHex] = parts
  const expected = Buffer.from(keyHex, 'hex')

  let actual: Buffer
  try {
    actual = scryptSync(
      password.normalize('NFKC'),
      Buffer.from(saltHex, 'hex'),
      expected.length,
      { N: Number(N), r: Number(r), p: Number(p) },
    )
  } catch {
    return false
  }

  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  )
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

function adminHash(): string {
  const hash = process.env.ADMIN_PASSWORD_HASH
  if (!hash) throw new NotConfiguredError()
  return hash
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD_HASH)
}

/**
 * Sealing key derived from the password hash, so rotating the passphrase
 * automatically invalidates every existing session. `useSession` needs at least
 * 32 characters; a sha256 hex digest is 64.
 */
function sessionConfig() {
  return {
    name: SESSION_NAME,
    password: createHash('sha256')
      .update(`misri-session:${adminHash()}`)
      .digest('hex'),
    maxAge: SESSION_MAX_AGE,
    cookie: {
      httpOnly: true,
      sameSite: 'strict' as const,
      path: '/',
      // Browsers reject `Secure` cookies over plain http, which would make
      // local development impossible; localhost is treated as a secure context
      // regardless, so the cookie is still not exposed to the network there.
      secure: process.env.NODE_ENV === 'production',
    },
  }
}

interface AdminSessionData {
  admin?: true
  signedInAt?: number
}

export async function isAdmin(): Promise<boolean> {
  if (!isAuthConfigured()) return false

  try {
    const session = await useSession<AdminSessionData>(sessionConfig())
    return session.data.admin === true
  } catch {
    // A cookie sealed under a previous passphrase fails to decrypt — that is a
    // signed-out user, not an error worth surfacing.
    return false
  }
}

/** Throws unless the caller holds a valid admin session. */
export async function requireAdmin(): Promise<void> {
  if (!isAuthConfigured()) throw new NotConfiguredError()
  if (!(await isAdmin())) throw new UnauthorizedError()
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

/**
 * With one shared secret, brute force is the whole threat model, so sign-in
 * attempts are capped per client address. In-memory is adequate for a
 * single-process club board; a multi-instance deploy would want shared state.
 */
const ATTEMPT_LIMIT = 8
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const attempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string) {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
    return
  }

  entry.count++
  if (entry.count > ATTEMPT_LIMIT) {
    const minutes = Math.ceil((entry.resetAt - now) / 60000)
    throw new UnauthorizedError(
      `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    )
  }
}

function clearRateLimit(key: string) {
  attempts.delete(key)
}

export async function signIn(password: string): Promise<void> {
  if (!isAuthConfigured()) throw new NotConfiguredError()

  // Behind Vercel's proxy the socket address is the proxy's, not the visitor's;
  // Vercel sets x-forwarded-for itself, so it is the address to trust.
  const key = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
  checkRateLimit(key)

  if (!verifyPassword(password, adminHash())) {
    throw new UnauthorizedError('Incorrect passphrase.')
  }

  clearRateLimit(key)

  const session = await useSession<AdminSessionData>(sessionConfig())
  await session.update({ admin: true, signedInAt: Date.now() })
}

export async function signOut(): Promise<void> {
  if (!isAuthConfigured()) return

  try {
    const session = await useSession<AdminSessionData>(sessionConfig())
    await session.clear()
  } catch {
    // Nothing to clear.
  }
}
