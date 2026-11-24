import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '#/db/client.server'

export {
  calendarToken,
  resetCalendarToken,
  userOfToken,
} from '@misri/core/calendar-token'

import { chessAccounts, competitions, matches, user } from '#/db/schema'
import { type CalendarEvent, icsCalendar } from '#/lib/calendar'

/**
 * A player's private calendar feed of open match deadlines. The link carries
 * the user id and a signature, so it needs no table and can't be guessed.
 */

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
