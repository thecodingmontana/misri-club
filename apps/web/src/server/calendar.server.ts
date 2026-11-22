import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '#/db/client.server'
import { chessAccounts, competitions, matches, user } from '#/db/schema'
import { type CalendarEvent, icsCalendar } from '#/lib/calendar'

/**
 * A player's private calendar feed of open match deadlines. The link carries
 * the user id and a signature, so it needs no table and can't be guessed.
 */

// shortcut: a leaked link can't be revoked on its own (only by rotating BETTER_AUTH_SECRET, which signs everyone out); add a stored token if anyone needs that
function signature(userId: string) {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set.')
  return createHmac('sha256', secret)
    .update(`calendar:${userId}`)
    .digest('base64url')
    .slice(0, 32)
}

export const calendarToken = (userId: string) =>
  `${userId}.${signature(userId)}`

/** The user id a token belongs to, or null when it isn't one of ours. */
export function userOfToken(token: string): string | null {
  const [userId, given] = token.replace(/\.ics$/, '').split('.')
  if (!userId || !given) return null
  const wanted = Buffer.from(signature(userId))
  const got = Buffer.from(given)
  return got.length === wanted.length && timingSafeEqual(got, wanted)
    ? userId
    : null
}

const HOUR = 60 * 60 * 1000

export async function calendarFeed(userId: string, origin: string) {
  const [exists] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!exists) return null

  const home = alias(chessAccounts, 'home')
  const away = alias(chessAccounts, 'away')
  const now = new Date()
  const rows = await db
    .select({
      id: matches.id,
      opensAt: matches.opensAt,
      dueAt: matches.dueAt,
      homeUserId: matches.homeUserId,
      homeName: sql<string>`coalesce(${home.username}, 'your opponent')`,
      awayName: sql<string>`coalesce(${away.username}, 'your opponent')`,
      competition: competitions.name,
      slug: competitions.slug,
    })
    .from(matches)
    .innerJoin(competitions, eq(competitions.id, matches.competitionId))
    .leftJoin(home, eq(home.userId, matches.homeUserId))
    .leftJoin(away, eq(away.userId, matches.awayUserId))
    .where(
      and(
        eq(competitions.status, 'running'),
        or(eq(matches.homeUserId, userId), eq(matches.awayUserId, userId)),
        sql`${matches.homeUserId} is not null and ${matches.awayUserId} is not null`,
        isNull(matches.result),
        isNull(matches.winnerUserId),
        eq(matches.voided, false),
        gt(matches.dueAt, now),
      ),
    )
    .orderBy(matches.dueAt)

  const events: CalendarEvent[] = rows.map((m) => {
    const opponent = m.homeUserId === userId ? m.awayName : m.homeName
    const opens = m.opensAt.toISOString().slice(0, 16).replace('T', ' ')
    return {
      uid: `${m.id}@misri`,
      // the last hour before the deadline: a calendar slot, not a booking
      start: new Date(m.dueAt.getTime() - HOUR),
      end: m.dueAt,
      summary: `Play ${opponent} (${m.competition})`,
      description: `Your game against ${opponent} must finish by this time. It counts from ${opens} UTC.`,
      url: `${origin}/c/${m.slug}`,
      alarmMinutes: 24 * 60,
    }
  })
  return icsCalendar('Misri matches', events, now)
}
