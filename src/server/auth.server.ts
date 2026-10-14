import { createHash, scryptSync, timingSafeEqual } from 'node:crypto'
import { getRequestIP, useSession } from '@tanstack/react-start/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { appMeta } from '#/db/schema'

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

/**
 * Checks `password` against a `scrypt$N$r$p$saltHex$keyHex` hash, as printed by
 * `scripts/set-admin-password.mjs`; the parameters travel with the hash.
 */
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

  return actual.length === expected.length && timingSafeEqual(actual, expected)
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
 * attempts are capped per client address. The count lives in `app_meta` (value
 * = attempts, `updated_at` = window start) because Vercel runs many instances
 * and an in-memory count would reset on each one. Counting is one upsert, so
 * parallel attempts cannot slip past the cap.
 */
const ATTEMPT_LIMIT = 8
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000

async function checkRateLimit(key: string) {
  const now = new Date()
  // Raw `sql` params skip the column's Date mapping, hence ISO plus a cast.
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS).toISOString()
  const expired = sql`${appMeta.updatedAt} < ${windowStart}::timestamptz`

  const [entry] = await db
    .insert(appMeta)
    .values({ key, value: '1', updatedAt: now })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: {
        value: sql`case when ${expired} then '1' else (${appMeta.value}::int + 1)::text end`,
        updatedAt: sql`case when ${expired} then excluded.updated_at else ${appMeta.updatedAt} end`,
      },
    })
    .returning({ count: appMeta.value, startedAt: appMeta.updatedAt })

  if (Number(entry.count) > ATTEMPT_LIMIT) {
    const minutes = Math.ceil(
      (entry.startedAt.getTime() + ATTEMPT_WINDOW_MS - now.getTime()) / 60000,
    )
    throw new UnauthorizedError(
      `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    )
  }
}

async function clearRateLimit(key: string) {
  await db.delete(appMeta).where(eq(appMeta.key, key))
}

export async function signIn(password: string): Promise<void> {
  if (!isAuthConfigured()) throw new NotConfiguredError()

  // Behind Vercel's proxy the socket address is the proxy's, not the visitor's;
  // Vercel sets x-forwarded-for itself, so it is the address to trust.
  const key = `login:${getRequestIP({ xForwardedFor: true }) ?? 'unknown'}`
  await checkRateLimit(key)

  if (!verifyPassword(password, adminHash())) {
    throw new UnauthorizedError('Incorrect passphrase.')
  }

  await clearRateLimit(key)

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
