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

async function competitionPush(competitionId: string) {
  const [row] = await db
    .select({
      ownerId: competitions.ownerId,
      name: competitions.name,
      slug: competitions.slug,
    })
    .from(competitions)
    .where(eq(competitions.id, competitionId))
    .limit(1)
  return row
}

async function playerName(userId: string) {
  const [row] = await db
    .select({
      name: sql<string>`coalesce(${chessAccounts.username}, ${user.name})`,
    })
    .from(user)
    .leftJoin(chessAccounts, eq(chessAccounts.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1)
  return row?.name ?? 'A player'
}

/** Tells the organiser a player left (after the start, with games settled). */
export async function notifyLeft(competitionId: string, leaverId: string) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort([
    {
      userId: competition.ownerId,
      title: `${await playerName(leaverId)} left ${competition.name}`,
      body: 'Their games were settled by your leave rule.',
      url: `/c/${competition.slug}`,
    },
  ])
}

/** Tells the organiser someone is waiting for their yes. */
export async function notifyRequested(competitionId: string, userId: string) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort([
    {
      userId: competition.ownerId,
      title: `${await playerName(userId)} asked to join ${competition.name}`,
      body: 'Approve or decline them on the competition page.',
      url: `/c/${competition.slug}`,
    },
  ])
}

/** Tells a player whether the organiser let them in. */
export async function notifyAnswered(
  competitionId: string,
  userId: string,
  approved: boolean,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort([
    {
      userId,
      title: approved
        ? `You're in ${competition.name}`
        : `${competition.name} declined your request`,
      url: approved ? `/c/${competition.slug}` : '/',
    },
  ])
}

/** Tells a player the organiser took them out. */
export async function notifyRemoved(competitionId: string, userId: string) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort([
    {
      userId,
      title: `You were removed from ${competition.name}`,
      body: 'The organiser took you out of this competition.',
      url: '/',
    },
  ])
}

/** Tells the new organiser it's theirs now. */
export async function notifyHandedOver(
  competitionId: string,
  toUserId: string,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort([
    {
      userId: toUserId,
      title: `You now run ${competition.name}`,
      body: 'The organiser handed it over to you.',
      url: `/c/${competition.slug}`,
    },
  ])
}

/** Tells the members their competition is gone. */
export async function notifyDeleted(name: string, memberIds: string[]) {
  await bestEffort(
    memberIds.map((userId) => ({
      userId,
      title: `${name} was deleted`,
      body: 'The organiser deleted this competition.',
      url: '/',
    })),
  )
}

/** The champion first, then everyone else in it. */
export async function notifyFinished(
  competitionId: string,
  championId: string,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  const members = await db
    .select({ userId: competitionMembers.userId })
    .from(competitionMembers)
    .where(eq(competitionMembers.competitionId, competitionId))
  const champion = await playerName(championId)
  await bestEffort(
    members.map(({ userId }) =>
      userId === championId
        ? {
            userId,
            title: `You won ${competition.name}!`,
            body: 'Congratulations, champion.',
            url: `/c/${competition.slug}`,
            tag: `finish-${competition.slug}`,
          }
        : {
            userId,
            title: `${champion} won ${competition.name}`,
            url: `/c/${competition.slug}`,
            tag: `finish-${competition.slug}`,
          },
    ),
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
