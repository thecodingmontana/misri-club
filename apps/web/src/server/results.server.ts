import { and, eq, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { db } from '#/db/client.server'
import {
  chessAccounts,
  competitionMembers,
  competitions,
  matches,
} from '#/db/schema'
import { authorize, roleOf, type Viewer } from '#/lib/access'
import { knockoutStep, leagueComplete } from '#/lib/competition-progress'
import { archiveMonths, findMatchResult } from '#/lib/game-result'
import { fetchMonthGames } from './chesscom.server'
import { notifyFinished } from './notifications.server'
import { compareStanding, tallyStandings } from './standings'

// Results: read from chess.com, decided by the organiser when needed, and
// moved forward (next knockout round, finish, champion) after every change.

const DAY = 24 * 60 * 60 * 1000
const SYNC_EVERY_MS = 5 * 60 * 1000

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Who won a decided result, given who had white. */
function winnerOf(
  result: 'white' | 'black' | 'draw',
  whiteUserId: string,
  blackUserId: string,
) {
  if (result === 'draw') return null
  return result === 'white' ? whiteUserId : blackUserId
}

/**
 * Reads chess.com for every open match of a running competition, at most once
 * per five minutes (the claim on synced_at makes concurrent views share one).
 */
export async function syncResults(competitionId: string, now = new Date()) {
  const [claimed] = await db
    .update(competitions)
    .set({ syncedAt: now })
    .where(
      and(
        eq(competitions.id, competitionId),
        eq(competitions.status, 'running'),
        or(
          isNull(competitions.syncedAt),
          lt(competitions.syncedAt, new Date(now.getTime() - SYNC_EVERY_MS)),
        ),
      ),
    )
    .returning({ format: competitions.format })
  if (!claimed) return

  const open = await db
    .select({
      id: matches.id,
      homeUserId: matches.homeUserId,
      awayUserId: matches.awayUserId,
      opensAt: matches.opensAt,
      dueAt: matches.dueAt,
      home: sql<
        string | null
      >`(select ${chessAccounts.username} from ${chessAccounts} where ${chessAccounts.userId} = ${matches.homeUserId})`,
      away: sql<
        string | null
      >`(select ${chessAccounts.username} from ${chessAccounts} where ${chessAccounts.userId} = ${matches.awayUserId})`,
    })
    .from(matches)
    .where(
      and(
        eq(matches.competitionId, competitionId),
        isNull(matches.result),
        isNull(matches.winnerUserId),
        eq(matches.voided, false),
        lte(matches.opensAt, now),
      ),
    )

  // one archive fetch per player-month, shared by their matches
  const months = new Map<string, ReturnType<typeof fetchMonthGames>>()
  const gamesOf = (username: string, month: string) => {
    const key = `${username}:${month}`
    let games = months.get(key)
    if (!games) {
      games = fetchMonthGames(username, month).catch(() => [])
      months.set(key, games)
    }
    return games
  }

  for (const m of open) {
    if (!m.home || !m.away || !m.homeUserId || !m.awayUserId) continue
    const { home, away, homeUserId, awayUserId } = m
    const until = m.dueAt < now ? m.dueAt : now
    const games = (
      await Promise.all(
        archiveMonths(m.opensAt, until).map((month) => gamesOf(home, month)),
      )
    ).flat()
    const found = findMatchResult(games, {
      home,
      away,
      opensAt: m.opensAt,
      dueAt: m.dueAt,
    })
    if (!found) continue
    const whiteUserId = found.homeWasWhite ? homeUserId : awayUserId
    const blackUserId = found.homeWasWhite ? awayUserId : homeUserId
    await db
      .update(matches)
      .set({
        result: found.result,
        whiteUserId,
        gameUrl: found.gameUrl,
        endedAt: found.endedAt,
        // a knockout tie is decided by who won; a league only needs the result
        winnerUserId:
          claimed.format === 'knockout'
            ? winnerOf(found.result, whiteUserId, blackUserId)
            : null,
      })
      // only if still open: an organiser decision in the meantime wins
      .where(
        and(
          eq(matches.id, m.id),
          isNull(matches.result),
          isNull(matches.winnerUserId),
        ),
      )
  }
  await advance(competitionId, now)
}

/**
 * After results change: the next knockout round, or the finish with a
 * champion. Locked, so two requests can't both create a round.
 */
export async function advance(competitionId: string, now = new Date()) {
  const championId = await db.transaction(async (tx) => {
    const [competition] = await tx
      .select()
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .for('update')
    if (competition?.status !== 'running') return null
    const rows = await tx
      .select()
      .from(matches)
      .where(eq(matches.competitionId, competitionId))

    if (competition.format === 'knockout') {
      const step = knockoutStep(rows)
      if (step.kind === 'next') {
        await tx.insert(matches).values(
          step.matches.map((m) => ({
            competitionId,
            round: m.round,
            homeUserId: m.homeId,
            awayUserId: m.awayId,
            byeUserId: m.byeId,
            opensAt: now,
            dueAt: new Date(now.getTime() + competition.matchdayDays * DAY),
          })),
        )
        return null
      }
      return step.kind === 'champion'
        ? finish(tx, competitionId, step.userId, now)
        : null
    }

    const members = await tx
      .select({ userId: competitionMembers.userId })
      .from(competitionMembers)
      .where(eq(competitionMembers.competitionId, competitionId))
    const memberIds = new Set(members.map((m) => m.userId))
    if (!leagueComplete(rows, memberIds, competition.unplayedRule, now)) {
      return null
    }
    const names = await tx
      .select({ userId: chessAccounts.userId, name: chessAccounts.username })
      .from(chessAccounts)
    const nameOf = new Map(names.map((n) => [n.userId, n.name]))
    const tally = tallyStandings(rows, [...memberIds], now, {
      unplayed: competition.unplayedRule,
      points: competition.points,
    })
    const [top] = [...tally]
      .filter(([id]) => memberIds.has(id))
      .map(([id, t]) => ({ id, ...t, name: nameOf.get(id) ?? id }))
      .sort(compareStanding)
    return top ? finish(tx, competitionId, top.id, now) : null
  })
  if (championId) await notifyFinished(competitionId, championId)
}

async function finish(
  tx: Tx,
  competitionId: string,
  championId: string,
  now: Date,
) {
  await tx
    .update(competitions)
    .set({ status: 'finished', finishedAt: now, championUserId: championId })
    .where(eq(competitions.id, competitionId))
  return championId
}

export type Decision =
  | { kind: 'result'; result: 'white' | 'black' | 'draw'; homeWhite: boolean }
  | { kind: 'walkover'; winnerUserId: string }
  | { kind: 'void' }
  | { kind: 'extend'; days: number }
  | { kind: 'reopen' }

const CLEARED = {
  result: null,
  winnerUserId: null,
  voided: false,
  whiteUserId: null,
}

/** What a decision writes to the match row (throws when it isn't allowed). */
function decisionFields(
  decision: Decision,
  match: typeof matches.$inferSelect & {
    homeUserId: string
    awayUserId: string
  },
  knockout: boolean,
): Partial<typeof matches.$inferInsert> {
  const { homeUserId, awayUserId } = match
  switch (decision.kind) {
    case 'result': {
      if (knockout && decision.result === 'draw') {
        throw new Error('A tournament tie needs a winner: award a walkover.')
      }
      const whiteUserId = decision.homeWhite ? homeUserId : awayUserId
      const blackUserId = decision.homeWhite ? awayUserId : homeUserId
      return {
        ...CLEARED,
        result: decision.result,
        whiteUserId,
        winnerUserId: knockout
          ? winnerOf(decision.result, whiteUserId, blackUserId)
          : null,
      }
    }
    case 'walkover':
      if (![homeUserId, awayUserId].includes(decision.winnerUserId)) {
        throw new Error('The walkover goes to one of the two players.')
      }
      return { ...CLEARED, winnerUserId: decision.winnerUserId }
    case 'void':
      if (knockout) {
        throw new Error('Someone has to go through: award a walkover instead.')
      }
      return { ...CLEARED, voided: true }
    case 'extend': {
      const from = Math.max(match.dueAt.getTime(), Date.now())
      return { dueAt: new Date(from + decision.days * DAY), remindedAt: null }
    }
    case 'reopen':
      return { ...CLEARED, gameUrl: null, endedAt: null }
  }
}

/**
 * The organiser settles one match: enter the result, award a walkover, call
 * it off, give more time, or reopen it (a dispute, a wrong call).
 */
export async function decideMatch(
  slug: string,
  viewer: Viewer,
  matchId: string,
  decision: Decision,
  note: string | null,
) {
  const competitionId = await db.transaction(async (tx) => {
    const [competition] = await tx
      .select()
      .from(competitions)
      .where(eq(competitions.slug, slug))
      .for('update')
    if (!competition) throw new Error('Not found.')
    authorize('manage', {
      role: roleOf(viewer, competition, false),
      isAdmin: viewer.isAdmin,
      visibility: competition.visibility,
    })
    if (competition.status !== 'running') {
      throw new Error('Only a running competition takes decisions.')
    }
    const [match] = await tx
      .select()
      .from(matches)
      .where(
        and(eq(matches.id, matchId), eq(matches.competitionId, competition.id)),
      )
      .limit(1)
    if (!match?.homeUserId || !match.awayUserId) {
      throw new Error('That match has no two players to decide.')
    }
    const knockout = competition.format === 'knockout'
    if (knockout) {
      // a decided round already fed the next one; changing it would fork the bracket
      const [later] = await tx
        .select({ id: matches.id })
        .from(matches)
        .where(
          and(
            eq(matches.competitionId, competition.id),
            sql`${matches.round} > ${match.round}`,
          ),
        )
        .limit(1)
      if (later) {
        throw new Error('The next round has started; this tie is final.')
      }
    }
    const fields = decisionFields(
      decision,
      { ...match, homeUserId: match.homeUserId, awayUserId: match.awayUserId },
      knockout,
    )
    await tx
      .update(matches)
      .set({ ...fields, note })
      .where(eq(matches.id, match.id))
    return competition.id
  })
  await advance(competitionId)
}
