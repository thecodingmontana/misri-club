import { db } from '@misri/db/client'
import {
  chessAccounts,
  competitionMembers,
  competitions,
  matches,
  notifications,
  user,
} from '@misri/db/schema'
import { and, eq, gt, inArray, isNull, lte, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { awaitsDecision } from './decisions.ts'
import { type PushMessage, sendPushes } from './push.ts'
import type { PushKind } from './push-kinds.ts'
import { reminderPushes } from './reminders.ts'
import { resultPushes } from './result-pushes.ts'
import { rankStandings } from './standings.ts'

// What reaches people's phones. Each sender is best-effort: a push that fails
// never fails the action that caused it.

const DAY = 24 * 60 * 60 * 1000
const REMINDER_SLACK_MS = 2 * 60 * 60 * 1000

async function bestEffort(list: PushMessage[], kind: PushKind) {
  if (list.length === 0) return
  const messages = list.map((m) => ({ ...m, kind }))
  // the inbox keeps a copy, so people without push still see it
  try {
    await db.insert(notifications).values(
      messages.map(({ userId, title, body, url }) => ({
        userId,
        title,
        body: body ?? null,
        url,
      })),
    )
  } catch (error) {
    console.error('[inbox] saving failed', (error as Error).message)
  }
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
    'games',
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
  await bestEffort(
    [
      {
        userId: competition.ownerId,
        title: `${await playerName(leaverId)} left ${competition.name}`,
        body: 'Their games were settled by your leave rule.',
        url: `/c/${competition.slug}`,
      },
    ],
    'news',
  )
}

/** Tells the organiser someone is waiting for their yes. */
export async function notifyRequested(competitionId: string, userId: string) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort(
    [
      {
        userId: competition.ownerId,
        title: `${await playerName(userId)} asked to join ${competition.name}`,
        body: 'Approve or decline them on the competition page.',
        url: `/c/${competition.slug}`,
      },
    ],
    'requests',
  )
}

/** Tells a player whether the organiser let them in. */
export async function notifyAnswered(
  competitionId: string,
  userId: string,
  approved: boolean,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort(
    [
      {
        userId,
        title: approved
          ? `You're in ${competition.name}`
          : `${competition.name} declined your request`,
        url: approved ? `/c/${competition.slug}` : '/',
      },
    ],
    'requests',
  )
}

/** Tells a player the organiser took them out. */
export async function notifyRemoved(competitionId: string, userId: string) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort(
    [
      {
        userId,
        title: `You were removed from ${competition.name}`,
        body: 'The organiser took you out of this competition.',
        url: '/',
      },
    ],
    'news',
  )
}

/** Tells the new organiser it's theirs now. */
export async function notifyHandedOver(
  competitionId: string,
  toUserId: string,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort(
    [
      {
        userId: toUserId,
        title: `You now run ${competition.name}`,
        body: 'The organiser handed it over to you.',
        url: `/c/${competition.slug}`,
      },
    ],
    'news',
  )
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
    'news',
  )
}

/** The champion first, then everyone else in it. */
export async function notifyFinished(
  competitionId: string,
  championId: string | null,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  if (!championId) {
    // a challenge that ended level
    const members = await db
      .select({ userId: competitionMembers.userId })
      .from(competitionMembers)
      .where(eq(competitionMembers.competitionId, competitionId))
    await bestEffort(
      members.map(({ userId }) => ({
        userId,
        title: `${competition.name} ended level`,
        body: 'A drawn match: neither of you could be caught.',
        url: `/c/${competition.slug}`,
        tag: `finish-${competition.slug}`,
      })),
      'results',
    )
    return
  }
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
    'results',
  )
}

/** A league round opened early: its players, and that playing now is optional. */
export async function notifyRoundOpened(competitionId: string, round: number) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  const rows = await db
    .select({ home: matches.homeUserId, away: matches.awayUserId })
    .from(matches)
    .where(
      and(eq(matches.competitionId, competitionId), eq(matches.round, round)),
    )
  const players = new Set(
    rows
      .flatMap((r) => [r.home, r.away])
      .filter((id): id is string => Boolean(id)),
  )
  await bestEffort(
    [...players].map((userId) => ({
      userId,
      title: `Round ${round} of ${competition.name} is open early`,
      body: 'Everyone finished the last round. Play now if you like; the deadline is unchanged.',
      url: `/c/${competition.slug}`,
      tag: `round-${competition.slug}-${round}`,
    })),
    'games',
  )
}

/**
 * The start day came: the organiser hears it started, or why it couldn't
 * (`failure`, null when it started).
 */
export async function notifyScheduledStart(
  competitionId: string,
  failure: string | null,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  await bestEffort(
    [
      {
        userId: competition.ownerId,
        title: failure
          ? `${competition.name} couldn't start`
          : `${competition.name} has started`,
        body: failure
          ? `${failure} Start it yourself once it's ready.`
          : 'It started on its scheduled day. Fixtures are out.',
        url: `/c/${competition.slug}`,
      },
    ],
    'news',
  )
}

/** Catch-up games moved into the league's rounds: both players hear where and when. */
export async function notifyGamesMoved(
  competitionId: string,
  moves: Array<{ homeId: string; awayId: string; round: number; dueAt: Date }>,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  const messages = []
  for (const move of moves) {
    const due = move.dueAt.toLocaleDateString('en', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Africa/Nairobi',
    })
    for (const [me, them] of [
      [move.homeId, move.awayId],
      [move.awayId, move.homeId],
    ]) {
      messages.push({
        userId: me,
        title: `Your game vs ${await playerName(them)} moved to round ${move.round}`,
        body: `In ${competition.name}. It's now part of round ${move.round}, due ${due}.`,
        url: `/c/${competition.slug}`,
      })
    }
  }
  await bestEffort(messages, 'games')
}

/**
 * Games added for a late joiner: one note per player, so nobody misses a new
 * fixture. Several new games (the joiner's) make one summary note.
 */
export async function notifyNewGames(
  competitionId: string,
  games: Array<{
    homeId: string
    awayId: string
    round: number
    dueAt: Date
    late: boolean
  }>,
) {
  if (games.length === 0) return
  const competition = await competitionPush(competitionId)
  if (!competition) return
  const byPlayer = new Map<string, typeof games>()
  for (const game of games) {
    for (const id of [game.homeId, game.awayId]) {
      byPlayer.set(id, [...(byPlayer.get(id) ?? []), game])
    }
  }
  const messages = []
  for (const [me, mine] of byPlayer) {
    const soonest = mine.reduce((a, b) => (b.dueAt < a.dueAt ? b : a))
    const due = soonest.dueAt.toLocaleDateString('en', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Africa/Nairobi',
    })
    if (mine.length > 1) {
      messages.push({
        userId: me,
        title: `You have ${mine.length} new games in ${competition.name}`,
        body: `Your fixtures are out. The first is due ${due}.`,
        url: `/c/${competition.slug}`,
      })
      continue
    }
    const them = soonest.homeId === me ? soonest.awayId : soonest.homeId
    const where = soonest.late
      ? 'the late-entry round'
      : `round ${soonest.round}`
    messages.push({
      userId: me,
      title: `New game vs ${await playerName(them)}`,
      body: `In ${competition.name}, ${where}, due ${due}.`,
      url: `/c/${competition.slug}`,
    })
  }
  await bestEffort(messages, 'games')
}

/** A rematch was asked for: the opponent gets the invite. */
export async function notifyRematch(
  competitionId: string,
  byUserId: string,
  opponentId: string,
  inviteCode: string,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  const by = await playerName(byUserId)
  await bestEffort(
    [
      {
        userId: opponentId,
        title: `${by} wants a rematch`,
        body: `${competition.name}: same settings. Join to start it.`,
        url: `/join/${inviteCode}`,
      },
    ],
    'games',
  )
}

/** A player reported a result: their opponent is asked to confirm it. */
export async function notifyReported(
  competitionId: string,
  byUserId: string,
  opponentId: string,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  const by = await playerName(byUserId)
  await bestEffort(
    [
      {
        userId: opponentId,
        title: `${by} reported your result`,
        body: `In ${competition.name}. Confirm it, or dispute it if it's wrong.`,
        url: `/c/${competition.slug}`,
      },
    ],
    'results',
  )
}

/** The opponent confirmed or disputed a report; a dispute goes to the organiser. */
export async function notifyReportAnswered(
  competitionId: string,
  byUserId: string,
  reporterId: string,
  accepted: boolean,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  const by = await playerName(byUserId)
  const reporter = await playerName(reporterId)
  const url = `/c/${competition.slug}`
  await bestEffort(
    [
      {
        userId: reporterId,
        title: accepted
          ? `${by} confirmed your result`
          : `${by} disputed your result`,
        body: accepted
          ? `It counts in ${competition.name}.`
          : `In ${competition.name}. The organiser will settle it.`,
        url,
      },
      ...(!accepted &&
      competition.ownerId !== byUserId &&
      competition.ownerId !== reporterId
        ? [
            {
              userId: competition.ownerId,
              title: `${reporter} and ${by} disagree on a result`,
              body: `In ${competition.name}. Enter the result yourself.`,
              url,
            },
          ]
        : []),
    ],
    'results',
  )
}

/** A player conceded: their opponent gets the win, and the organiser hears of it. */
export async function notifyConceded(
  competitionId: string,
  byUserId: string,
  toUserId: string,
) {
  const competition = await competitionPush(competitionId)
  if (!competition) return
  const by = await playerName(byUserId)
  const to = await playerName(toUserId)
  const url = `/c/${competition.slug}`
  await bestEffort(
    [
      {
        userId: toUserId,
        title: `${by} gave you a walkover`,
        body: `They can't play your ${competition.name} match. The win is yours.`,
        url,
      },
      ...(competition.ownerId !== byUserId && competition.ownerId !== toUserId
        ? [
            {
              userId: competition.ownerId,
              title: `${by} conceded to ${to}`,
              body: `In ${competition.name}. You can reopen the match if it was a mistake.`,
              url,
            },
          ]
        : []),
    ],
    'results',
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
  await bestEffort(
    [
      {
        userId: row.ownerId,
        title: `${row.joiner} joined ${row.name}`,
        url: `/c/${row.slug}`,
      },
    ],
    'news',
  )
}

/**
 * Open matches due within about a day that nobody has played: claims them (so a
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
        eq(matches.voided, false),
        sql`${matches.homeUserId} is not null and ${matches.awayUserId} is not null`,
        // a finished or deleted competition's leftovers aren't anyone's deadline
        inArray(
          matches.competitionId,
          db
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.status, 'running')),
        ),
        lte(matches.opensAt, now),
        gt(matches.dueAt, now),
        // the cron runs daily at a slightly different second each time: a
        // strict 24h window misses deadlines a few seconds past it
        lte(matches.dueAt, new Date(now.getTime() + DAY + REMINDER_SLACK_MS)),
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
  await bestEffort(reminderPushes(due), 'games')
  return due.length
}

/** Results chess.com just settled: both players, with their place in a league. */
export async function notifyResults(competitionId: string, matchIds: string[]) {
  if (matchIds.length === 0) return
  const [competition] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.id, competitionId))
  if (!competition) return
  const home = alias(chessAccounts, 'home')
  const away = alias(chessAccounts, 'away')
  const homeUser = alias(user, 'home_user')
  const awayUser = alias(user, 'away_user')
  const settled = await db
    .select({
      matchId: matches.id,
      homeUserId: sql<string>`${matches.homeUserId}`,
      awayUserId: sql<string>`${matches.awayUserId}`,
      homeName: sql<string>`coalesce(${home.username}, ${homeUser.name})`,
      awayName: sql<string>`coalesce(${away.username}, ${awayUser.name})`,
      result: sql<'white' | 'black' | 'draw'>`${matches.result}`,
      whiteUserId: sql<string>`${matches.whiteUserId}`,
    })
    .from(matches)
    .innerJoin(homeUser, eq(homeUser.id, matches.homeUserId))
    .innerJoin(awayUser, eq(awayUser.id, matches.awayUserId))
    .leftJoin(home, eq(home.userId, matches.homeUserId))
    .leftJoin(away, eq(away.userId, matches.awayUserId))
    .where(inArray(matches.id, matchIds))

  let placeOf: (userId: string) => number | null = () => null
  if (competition.format === 'league') {
    const [all, members] = await Promise.all([
      db.select().from(matches).where(eq(matches.competitionId, competitionId)),
      db
        .select({
          id: competitionMembers.userId,
          name: sql<string>`coalesce(${chessAccounts.username}, ${user.name})`,
        })
        .from(competitionMembers)
        .innerJoin(user, eq(user.id, competitionMembers.userId))
        .leftJoin(chessAccounts, eq(chessAccounts.userId, user.id))
        .where(eq(competitionMembers.competitionId, competitionId)),
    ])
    const names = new Map(members.map((m) => [m.id, m.name]))
    // ranked exactly as the competition page ranks it
    const table = rankStandings(
      all,
      members.map((m) => m.id),
      new Date(),
      {
        unplayed: competition.unplayedRule,
        points: competition.points,
        walkoverWinsBreakTies: competition.walkoverWinsBreakTies,
      },
      competition.tieBreaks,
      (id) => names.get(id) ?? id,
    )
    placeOf = (id) => {
      const i = table.findIndex((row) => row.id === id)
      return i < 0 ? null : i + 1
    }
  }
  await bestEffort(resultPushes(settled, competition, placeOf), 'results')
}

/**
 * The day before a scheduled start: everyone in it, once. The daily cron
 * starts it the next morning (startScheduled), so "tomorrow" is the next run.
 */
export async function remindStarts(now = new Date()) {
  const soon = await db
    .update(competitions)
    .set({ startRemindedAt: now })
    .where(
      and(
        eq(competitions.status, 'open'),
        isNull(competitions.startRemindedAt),
        gt(competitions.startsAt, now),
        lte(
          competitions.startsAt,
          new Date(now.getTime() + DAY + REMINDER_SLACK_MS),
        ),
      ),
    )
    .returning({
      id: competitions.id,
      name: competitions.name,
      slug: competitions.slug,
    })
  if (soon.length === 0) return 0
  const members = await db
    .select({
      competitionId: competitionMembers.competitionId,
      userId: competitionMembers.userId,
    })
    .from(competitionMembers)
    .where(
      inArray(
        competitionMembers.competitionId,
        soon.map((c) => c.id),
      ),
    )
  await bestEffort(
    soon.flatMap((c) => {
      const players = members.filter((m) => m.competitionId === c.id)
      return players.map((m) => ({
        userId: m.userId,
        title: `${c.name} starts tomorrow`,
        body: `${players.length} ${players.length === 1 ? 'player is' : 'players are'} in. Your first games come out in the morning.`,
        url: `/c/${c.slug}`,
        tag: `starts-${c.slug}`,
      }))
    }),
    'news',
  )
  return soon.length
}

/**
 * Once a day, organisers with games waiting on their decision hear how many.
 * The tag replaces yesterday's nudge instead of stacking another.
 */
export async function remindOrganisers(now = new Date()) {
  const running = await db
    .select()
    .from(competitions)
    .where(eq(competitions.status, 'running'))
  if (running.length === 0) return 0
  const rows = await db
    .select()
    .from(matches)
    .where(
      inArray(
        matches.competitionId,
        running.map((c) => c.id),
      ),
    )
  const nudges = running.flatMap((c) => {
    const waiting = rows.filter(
      (m) => m.competitionId === c.id && awaitsDecision(m, c, now.getTime()),
    ).length
    if (waiting === 0) return []
    return [
      {
        userId: c.ownerId,
        title: `${waiting} ${waiting === 1 ? 'game is' : 'games are'} waiting for your decision`,
        body: `In ${c.name}. Decide each one from the competition page.`,
        url: `/c/${c.slug}`,
        tag: `decide-${c.slug}`,
      },
    ]
  })
  await bestEffort(nudges, 'results')
  return nudges.length
}
