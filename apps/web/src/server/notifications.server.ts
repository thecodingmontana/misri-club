import { and, eq, gt, isNull, lte, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '#/db/client.server'
import {
  chessAccounts,
  competitionMembers,
  competitions,
  matches,
  user,
} from '#/db/schema'
import { reminderPushes } from '#/lib/reminders'
import { type PushMessage, sendPushes } from './push.server'

// What reaches people's phones. Each sender is best-effort: a push that fails
// never fails the action that caused it.

const DAY = 24 * 60 * 60 * 1000

async function bestEffort(messages: PushMessage[]) {
  try {
    await sendPushes(messages)
  } catch (error) {
    console.error('[push] sending failed', (error as Error).message)
  }
}

/** Fixtures are out: every member but the organiser who pressed Start. */
export async function notifyStarted(competitionId: string) {
  const rows = await db
    .select({
      userId: competitionMembers.userId,
      name: competitions.name,
      slug: competitions.slug,
    })
    .from(competitionMembers)
    .innerJoin(
      competitions,
      eq(competitions.id, competitionMembers.competitionId),
    )
    .where(
      and(
        eq(competitionMembers.competitionId, competitionId),
        ne(competitionMembers.userId, competitions.ownerId),
      ),
    )
  await bestEffort(
    rows.map((r) => ({
      userId: r.userId,
      title: `${r.name} has started`,
      body: 'Fixtures are out. Your first match is open.',
      url: `/c/${r.slug}`,
      tag: `start-${r.slug}`,
    })),
  )
}

/** Tells the organiser who joined. */
export async function notifyJoined(competitionId: string, joinerId: string) {
  const [row] = await db
    .select({
      ownerId: competitions.ownerId,
      name: competitions.name,
      slug: competitions.slug,
      joiner: sql<string>`coalesce(${chessAccounts.username}, ${user.name})`,
    })
    .from(competitions)
    .innerJoin(user, eq(user.id, joinerId))
    .leftJoin(chessAccounts, eq(chessAccounts.userId, joinerId))
    .where(eq(competitions.id, competitionId))
    .limit(1)
  if (!row || row.ownerId === joinerId) return
  await bestEffort([
    {
      userId: row.ownerId,
      title: `${row.joiner} joined ${row.name}`,
      url: `/c/${row.slug}`,
    },
  ])
}

/**
 * Open matches due within a day that nobody has played: claims them (so a
 * second run sends nothing) and reminds both players.
 */
export async function remindDeadlines(now = new Date()) {
  const claimed = await db
    .update(matches)
    .set({ remindedAt: now })
    .where(
      and(
        isNull(matches.remindedAt),
        isNull(matches.result),
        isNull(matches.winnerUserId),
        sql`${matches.homeUserId} is not null and ${matches.awayUserId} is not null`,
        lte(matches.opensAt, now),
        gt(matches.dueAt, now),
        lte(matches.dueAt, new Date(now.getTime() + DAY)),
      ),
    )
    .returning({ id: matches.id })
  if (claimed.length === 0) return 0

  const home = alias(chessAccounts, 'home')
  const away = alias(chessAccounts, 'away')
  const due = await db
    .select({
      matchId: matches.id,
      homeUserId: sql<string>`${matches.homeUserId}`,
      awayUserId: sql<string>`${matches.awayUserId}`,
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
      sql`${matches.id} in (${sql.join(
        claimed.map((c) => sql`${c.id}`),
        sql`, `,
      )})`,
    )
  await bestEffort(reminderPushes(due))
  return due.length
}
