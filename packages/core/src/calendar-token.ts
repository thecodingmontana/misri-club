import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@misri/db/client'
import { user } from '@misri/db/schema'
import { eq, sql } from 'drizzle-orm'

/**
 * The private calendar link's token: the user id and a signature, so it needs
 * no table and can't be guessed. Shared by the website (which serves the feed)
 * and the API (which hands the app its link).
 */

// Version 0 signs exactly as links always have, so existing subscriptions keep
// working; "Reset link" bumps the version and every older link stops.
function signature(userId: string, version: number) {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set.')
  return createHmac('sha256', secret)
    .update(version ? `calendar:${userId}:${version}` : `calendar:${userId}`)
    .digest('base64url')
    .slice(0, 32)
}

async function versionOf(userId: string) {
  const [row] = await db
    .select({ version: user.calendarVersion })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return row?.version ?? null
}

export async function calendarToken(userId: string) {
  return `${userId}.${signature(userId, (await versionOf(userId)) ?? 0)}`
}

/** Makes a new link; the old one stops working. */
export async function resetCalendarToken(userId: string) {
  await db
    .update(user)
    .set({ calendarVersion: sql`${user.calendarVersion} + 1` })
    .where(eq(user.id, userId))
  return calendarToken(userId)
}

/** The user id a token belongs to, or null when it isn't one of ours (or was reset). */
export async function userOfToken(token: string): Promise<string | null> {
  const [userId, given, extra] = token.replace(/\.ics$/, '').split('.')
  if (!userId || !given || extra !== undefined) return null
  const version = await versionOf(userId)
  if (version === null) return null
  const wanted = Buffer.from(signature(userId, version))
  const got = Buffer.from(given)
  return got.length === wanted.length && timingSafeEqual(got, wanted)
    ? userId
    : null
}

/** The feed's path on the website. */
export const calendarPath = (token: string) => `/api/calendar/${token}.ics`
