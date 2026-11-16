import { and, eq, gt, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { db } from '#/db/client.server'
import {
  chessAccounts,
  competitionLeavers,
  competitionMembers,
  competitions,
  matches,
  user,
} from '#/db/schema'
import { authorize, roleOf, type Viewer } from '#/lib/access'
import { knockoutLegs } from '#/lib/bracket'
import { challengeOutcome } from '#/lib/challenge'
import { knockoutStep, leagueComplete } from '#/lib/competition-progress'
import {
  CONCEDED,
  concedeTo,
  type Decision,
  decisionFields,
  winnerOf,
} from '#/lib/decisions'
import { earlyRound } from '#/lib/early-rounds'
import { archiveMonths, findMatchResult } from '#/lib/game-result'
import { fetchMonthGames } from './chesscom.server'
import {
  notifyConceded,
  notifyFinished,
  notifyRoundOpened,
} from './notifications.server'
import { rankStandings } from './standings'

// Results: read from chess.com, decided by the organiser when needed, and
// moved forward (next knockout round, finish, champion) after every change.

const DAY = 24 * 60 * 60 * 1000
const SYNC_EVERY_MS = 5 * 60 * 1000

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Reads chess.com for every open match of a running competition, at most once
 * per five minutes (the claim on synced_at makes concurrent views share one).
 * Returns how many results it wrote.
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
    .returning({
      format: competitions.format,
      legs: competitions.legs,
      timeControl: competitions.timeControl,
    })
  if (!claimed) return 0

  // games already counted in this competition never count again
  const used = new Set(
    (
      await db
        .select({ url: matches.gameUrl })
        .from(matches)
        .where(
          and(
            eq(matches.competitionId, competitionId),
            sql`${matches.gameUrl} is not null`,
          ),
        )
    ).map((r) => r.url as string),
  )
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
    // earlier games of a challenge claim the earlier chess.com games
    .orderBy(matches.round, matches.position)

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

  let changed = 0
  for (const m of open) {
    if (!m.home || !m.away || !m.homeUserId || !m.awayUserId) continue
    const { home, away, homeUserId, awayUserId } = m
    const until = m.dueAt < now ? m.dueAt : now
    const games = (
      await Promise.all(
        archiveMonths(m.opensAt, until).map((month) => gamesOf(home, month)),
      )
    ).flat()
    const found = findMatchResult(
      games,
      {
        home,
        away,
        opensAt: m.opensAt,
        dueAt: m.dueAt,
        timeControl: claimed.timeControl,
      },
      used,
    )
    if (!found) continue
    used.add(found.gameUrl)
    const whiteUserId = found.homeWasWhite ? homeUserId : awayUserId
    const blackUserId = found.homeWasWhite ? awayUserId : homeUserId
    const written = await db
      .update(matches)
      .set({
        result: found.result,
        whiteUserId,
        gameUrl: found.gameUrl,
        endedAt: found.endedAt,
        // a one-game knockout tie is decided by who won; elsewhere the result is enough
        winnerUserId:
          claimed.format === 'knockout' && claimed.legs === 1
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
      .returning({ id: matches.id })
    changed += written.length
  }
  await advance(competitionId, now)
  return changed
}

/**
 * After results change: the next knockout round, or the finish with a
 * champion. Locked, so two requests can't both create a round.
 */
export async function advance(competitionId: string, now = new Date()) {
  let opened: number | null = null
  let drawn = false
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

    if (competition.format === 'challenge') {
      const [first] = rows
      if (!first?.homeUserId || !first.awayUserId) return null
      const outcome = challengeOutcome(rows, first.homeUserId, first.awayUserId)
      if (outcome.kind === 'going') return null
      // decided: the games nobody needs to play are called off
      await tx
        .update(matches)
        .set({ voided: true })
        .where(
          and(
            eq(matches.competitionId, competitionId),
            isNull(matches.result),
            isNull(matches.winnerUserId),
          ),
        )
      if (outcome.kind === 'drawn') {
        drawn = true
        return finish(tx, competitionId, null, now)
      }
      return finish(tx, competitionId, outcome.userId, now)
    }

    if (competition.format === 'knockout') {
      const leavers = await tx
        .select({ userId: competitionLeavers.userId })
        .from(competitionLeavers)
        .where(eq(competitionLeavers.competitionId, competitionId))
      const gone = new Set(leavers.map((l) => l.userId))
      // a round of only byes (after someone left) is decided at once: keep going
      for (let all = rows; ; ) {
        const step = knockoutStep(all, gone)
        if (step.kind === 'champion') {
          return finish(tx, competitionId, step.userId, now)
        }
        const dueAt = new Date(now.getTime() + competition.matchdayDays * DAY)
        if (step.kind === 'deciders') {
          // level after both legs: one more game decides it
          await tx.insert(matches).values(
            step.ties.map((t) => ({
              competitionId,
              round: t.round,
              position: t.position,
              leg: 3,
              homeUserId: t.homeId,
              awayUserId: t.awayId,
              opensAt: now,
              dueAt,
            })),
          )
          return null
        }
        if (step.kind !== 'next') return null
        const inserted = await tx
          .insert(matches)
          .values(
            knockoutLegs(step.matches, competition.legs).map((m) => ({
              competitionId,
              round: m.round,
              position: m.position,
              leg: m.leg,
              homeUserId: m.homeId,
              awayUserId: m.awayId,
              byeUserId: m.byeId,
              opensAt: now,
              dueAt,
            })),
          )
          .returning()
        if (inserted.some((m) => !m.byeUserId)) return null
        all = [...all, ...inserted]
      }
    }

    const members = await tx
      .select({ userId: competitionMembers.userId })
      .from(competitionMembers)
      .where(eq(competitionMembers.competitionId, competitionId))
    const memberIds = new Set(members.map((m) => m.userId))
    if (!leagueComplete(rows, memberIds, competition.unplayedRule, now)) {
      if (competition.earlyRounds === 'auto') {
        opened = await openRound(tx, competition, rows, memberIds, now)
      }
      return null
    }
    // the same names the table sorts by, so the champion is its top row
    const names = await tx
      .select({
        userId: user.id,
        name: sql<string>`coalesce(${chessAccounts.username}, ${user.name})`,
      })
      .from(user)
      .leftJoin(chessAccounts, eq(chessAccounts.userId, user.id))
      .where(inArray(user.id, [...memberIds]))
    const nameOf = new Map(names.map((n) => [n.userId, n.name]))
    const [top] = rankStandings(
      rows,
      [...memberIds],
      now,
      { unplayed: competition.unplayedRule, points: competition.points },
      competition.tieBreaks,
      (id) => nameOf.get(id) ?? id,
    )
    return top ? finish(tx, competitionId, top.id, now) : null
  })
  if (championId || drawn) await notifyFinished(competitionId, championId)
  if (opened) await notifyRoundOpened(competitionId, opened)
}

/** Opens the next league round now if everyone has played; its deadline stays. */
async function openRound(
  tx: Tx,
  competition: typeof competitions.$inferSelect,
  rows: Array<typeof matches.$inferSelect>,
  memberIds: Set<string>,
  now: Date,
) {
  const round = earlyRound(rows, memberIds, competition.unplayedRule, now)
  if (round === null) return null
  await tx
    .update(matches)
    .set({ opensAt: now })
    .where(
      and(
        eq(matches.competitionId, competition.id),
        eq(matches.round, round),
        gt(matches.opensAt, now),
      ),
    )
  return round
}

/** The organiser opens the next league round early (the "Let me decide" setting). */
export async function openEarlyRound(slug: string, viewer: Viewer) {
  const now = new Date()
  const result = await db.transaction(async (tx) => {
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
    if (competition.format !== 'league' || competition.status !== 'running') {
      throw new Error('Only a running league opens rounds early.')
    }
    if (competition.earlyRounds === 'wait') {
      throw new Error('This league waits for each round’s date.')
    }
    const rows = await tx
      .select()
      .from(matches)
      .where(eq(matches.competitionId, competition.id))
    const members = await tx
      .select({ userId: competitionMembers.userId })
      .from(competitionMembers)
      .where(eq(competitionMembers.competitionId, competition.id))
    const memberIds = new Set(members.map((m) => m.userId))
    const round = await openRound(tx, competition, rows, memberIds, now)
    if (round === null) {
      throw new Error(
        'Some games are still to play, or this is the last round.',
      )
    }
    return { id: competition.id, round }
  })
  await notifyRoundOpened(result.id, result.round)
  return result.round
}

async function finish(
  tx: Tx,
  competitionId: string,
  championId: string | null,
  now: Date,
) {
  await tx
    .update(competitions)
    .set({ status: 'finished', finishedAt: now, championUserId: championId })
    .where(eq(competitions.id, competitionId))
  return championId
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
    if (knockout && decision.kind === 'void') {
      throw new Error('Someone has to go through: award a walkover instead.')
    }
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
    // a home & away leg can be drawn: the aggregate decides the tie
    const fields = decisionFields(
      decision,
      { ...match, homeUserId: match.homeUserId, awayUserId: match.awayUserId },
      knockout && competition.legs === 1,
    )
    await tx
      .update(matches)
      .set({ ...fields, note })
      .where(eq(matches.id, match.id))
    return competition.id
  })
  await advance(competitionId)
}

/**
 * Syncs every running competition the player is in, for the app's background
 * refresh. Each competition still syncs at most once per five minutes.
 */
export async function syncForPlayer(userId: string) {
  const running = await db
    .select({ id: competitions.id })
    .from(competitions)
    .innerJoin(
      competitionMembers,
      and(
        eq(competitionMembers.competitionId, competitions.id),
        eq(competitionMembers.userId, userId),
      ),
    )
    .where(eq(competitions.status, 'running'))
  let changed = 0
  for (const { id } of running) {
    changed += await syncResults(id).catch((error) => {
      console.error('[results] sync failed', id, (error as Error).message)
      return 0
    })
  }
  return changed
}

/** A player hands their opponent the walkover; the organiser can still reopen it. */
export async function concedeMatch(
  slug: string,
  viewer: Viewer,
  matchId: string,
) {
  const done = await db.transaction(async (tx) => {
    const [competition] = await tx
      .select()
      .from(competitions)
      .where(eq(competitions.slug, slug))
      .for('update')
    if (!competition) throw new Error('Not found.')
    if (competition.status !== 'running') {
      throw new Error('Only a running competition takes walkovers.')
    }
    const [match] = await tx
      .select()
      .from(matches)
      .where(
        and(eq(matches.id, matchId), eq(matches.competitionId, competition.id)),
      )
      .limit(1)
    if (!match) throw new Error('Not found.')
    const opponent = concedeTo(match, viewer.id)
    // only if still open: a result or decision in the meantime wins
    const written = await tx
      .update(matches)
      .set({ winnerUserId: opponent, note: CONCEDED })
      .where(
        and(
          eq(matches.id, match.id),
          isNull(matches.result),
          isNull(matches.winnerUserId),
        ),
      )
      .returning({ id: matches.id })
    if (written.length === 0) throw new Error('That match is already decided.')
    return { competitionId: competition.id, opponent }
  })
  await advance(done.competitionId)
  await notifyConceded(done.competitionId, viewer.id, done.opponent)
}
