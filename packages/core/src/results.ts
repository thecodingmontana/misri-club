import { db } from '@misri/db/client'
import {
  chessAccounts,
  competitionLeavers,
  competitionMembers,
  competitions,
  type MatchReport,
  matches,
  user,
} from '@misri/db/schema'
import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  max,
  or,
  sql,
} from 'drizzle-orm'
import { authorize, roleOf, type Viewer } from './access.ts'
import { generateKnockoutRound1, knockoutLegs } from './bracket.ts'
import { challengeOutcome } from './challenge.ts'
import { fetchMonthGames } from './chesscom.ts'
import { knockoutStep, leagueComplete } from './competition-progress.ts'
import { tidyLateGames } from './competitions.ts'
import {
  CONCEDED,
  concedeTo,
  type Decision,
  decisionFields,
  reportFor,
  winnerOf,
} from './decisions.ts'
import { earlyRound } from './early-rounds.ts'
import { UserError } from './errors.ts'
import { archiveMonths, findMatchResult } from './game-result.ts'
import { qualifierSeeds } from './groups.ts'
import {
  notifyConceded,
  notifyFinished,
  notifyReportAnswered,
  notifyReported,
  notifyRoundOpened,
} from './notifications.ts'
import { rankStandings } from './standings.ts'

// Results: read from chess.com, decided by the organiser when needed, and
// moved forward (next knockout round, finish, champion) after every change.

const DAY = 24 * 60 * 60 * 1000
const SYNC_EVERY_MS = 5 * 60 * 1000
const ARCHIVE_LAG_MS = 10 * 60 * 1000

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
        // tracked competitions take results from players, not chess.com
        eq(competitions.resultSource, 'chesscom'),
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

  // one chess.com game counts once: a game already counted anywhere (here, or
  // another competition between the same players) never counts again
  const players = db
    .select({ id: competitionMembers.userId })
    .from(competitionMembers)
    .where(eq(competitionMembers.competitionId, competitionId))
  const used = new Set(
    (
      await db
        .select({ url: matches.gameUrl })
        .from(matches)
        .where(
          and(
            sql`${matches.gameUrl} is not null`,
            or(
              eq(matches.competitionId, competitionId),
              inArray(matches.homeUserId, players),
              inArray(matches.awayUserId, players),
            ),
          ),
        )
    ).map((r) => r.url as string),
  )
  // a challenge's games come in order: a game that ended before the latest
  // decided one (an organiser's call stores no game link) was already counted
  const [decided] =
    claimed.format === 'challenge'
      ? await db
          .select({ at: max(matches.endedAt) })
          .from(matches)
          .where(eq(matches.competitionId, competitionId))
      : []
  const after = decided?.at?.getTime() ?? 0
  const open = await db
    .select({
      id: matches.id,
      homeUserId: matches.homeUserId,
      awayUserId: matches.awayUserId,
      opensAt: matches.opensAt,
      dueAt: matches.dueAt,
      groupNo: matches.groupNo,
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
  let fetchFailed = false
  const gamesOf = (username: string, month: string) => {
    const key = `${username}:${month}`
    let games = months.get(key)
    if (!games) {
      games = fetchMonthGames(username, month).catch(() => {
        fetchFailed = true
        return []
      })
      months.set(key, games)
    }
    return games
  }

  const groupsClosed =
    claimed.format === 'groups' &&
    (await groupStageClosed(
      db,
      { id: competitionId, format: 'groups' },
      { groupNo: 0 },
    ))
  let changed = 0
  for (const m of open) {
    // a late group result can't redraw a bracket already played from the tables
    if (groupsClosed && m.groupNo !== null) continue
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
        opensAt: new Date(Math.max(m.opensAt.getTime(), after + 1)),
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
        report: null,
        // a one-game knockout tie is decided by who won; elsewhere the result is enough
        winnerUserId:
          (claimed.format === 'knockout' && claimed.legs === 1) ||
          (claimed.format === 'groups' && m.groupNo === null)
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
  // a game chess.com couldn't tell us about may be the one that settles it
  if (!fetchFailed) {
    await db
      .update(competitions)
      // chess.com can take a few minutes to publish a game; leave that margin unread
      .set({ readThrough: new Date(now.getTime() - ARCHIVE_LAG_MS) })
      .where(eq(competitions.id, competitionId))
    await advance(competitionId, now)
  }
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

    // a deadline passed since chess.com was last read in full: a game played
    // in time may be waiting there, so the next sync settles it, not the clock
    if (competition.resultSource === 'chesscom') {
      const readThrough = competition.readThrough?.getTime() ?? 0
      const unread = rows.some(
        (m) =>
          m.homeUserId &&
          m.awayUserId &&
          !m.result &&
          !m.winnerUserId &&
          !m.voided &&
          m.dueAt <= now &&
          m.dueAt.getTime() > readThrough,
      )
      if (unread) return null
    }

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
      return advanceKnockout(tx, competition, rows, competition.legs, now)
    }

    if (competition.format === 'groups') {
      return advanceGroups(tx, competition, rows, now)
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
    const nameOf = await namesOf(tx, [...memberIds])
    const [top] = rankStandings(
      rows,
      [...memberIds],
      now,
      {
        unplayed: competition.unplayedRule,
        points: competition.points,
        walkoverWinsBreakTies: competition.walkoverWinsBreakTies,
      },
      competition.tieBreaks,
      nameOf,
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
    .set({ opensAt: lastResultAt(rows, now) })
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
    if (!competition) throw new UserError('Not found.')
    authorize('manage', {
      role: roleOf(viewer, competition, false),
      isAdmin: viewer.isAdmin,
      visibility: competition.visibility,
    })
    if (competition.format !== 'league' || competition.status !== 'running') {
      throw new UserError('Only a running league opens rounds early.')
    }
    if (competition.earlyRounds === 'wait') {
      throw new UserError('This league waits for each round’s date.')
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
      throw new UserError(
        'Some games are still to play, or this is the last round.',
      )
    }
    return { id: competition.id, round }
  })
  await notifyRoundOpened(result.id, result.round)
  return result.round
}

type CompetitionRow = typeof competitions.$inferSelect
type MatchRow = typeof matches.$inferSelect

/**
 * When the last result came in. A round that opens because of it opens then,
 * not when a sync first noticed (maybe hours later), so games the players
 * played straight away still count.
 */
function lastResultAt(rows: MatchRow[], now: Date) {
  const ended = rows
    .map((m) => m.endedAt?.getTime() ?? 0)
    .filter((t) => t <= now.getTime())
  const latest = Math.max(0, ...ended)
  return latest ? new Date(latest) : now
}

/** Next knockout round, a decider, or the champion. `legs` per tie (1 or 2). */
async function advanceKnockout(
  tx: Tx,
  competition: CompetitionRow,
  rows: MatchRow[],
  legs: number,
  now: Date,
) {
  const competitionId = competition.id
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
    const opensAt = lastResultAt(all, now)
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
          opensAt,
          dueAt,
        })),
      )
      return null
    }
    if (step.kind !== 'next') return null
    const inserted = await tx
      .insert(matches)
      .values(
        knockoutLegs(step.matches, legs).map((m) => ({
          competitionId,
          round: m.round,
          position: m.position,
          leg: m.leg,
          homeUserId: m.homeId,
          awayUserId: m.awayId,
          byeUserId: m.byeId,
          opensAt,
          dueAt,
        })),
      )
      .returning()
    if (inserted.some((m) => !m.byeUserId)) return null
    all = [...all, ...inserted]
  }
}

/** Names the tables sort by (chess.com username, else account name). */
async function namesOf(tx: Tx, ids: string[]) {
  const names = await tx
    .select({
      userId: user.id,
      name: sql<string>`coalesce(${chessAccounts.username}, ${user.name})`,
    })
    .from(user)
    .leftJoin(chessAccounts, eq(chessAccounts.userId, user.id))
    .where(inArray(user.id, ids))
  const nameOf = new Map(names.map((n) => [n.userId, n.name]))
  return (id: string) => nameOf.get(id) ?? id
}

/**
 * Groups then knockout: once every group game is settled, the top of each
 * group goes into a single-game bracket; after that it advances as a knockout.
 */
async function advanceGroups(
  tx: Tx,
  competition: CompetitionRow,
  rows: MatchRow[],
  now: Date,
) {
  const knockout = rows.filter((m) => m.groupNo === null)
  if (knockout.length > 0) {
    return advanceKnockout(tx, competition, knockout, 1, now)
  }
  const groupGames = rows.filter((m) => m.groupNo !== null)
  const members = await tx
    .select({
      userId: competitionMembers.userId,
      groupNo: competitionMembers.groupNo,
    })
    .from(competitionMembers)
    .where(eq(competitionMembers.competitionId, competition.id))
  const memberIds = new Set(members.map((m) => m.userId))
  if (!leagueComplete(groupGames, memberIds, competition.unplayedRule, now)) {
    return null
  }
  const nameOf = await namesOf(tx, [...memberIds])
  const ranked = Array.from({ length: competition.groupCount }, (_, groupNo) =>
    rankStandings(
      groupGames.filter((m) => m.groupNo === groupNo),
      members.filter((m) => m.groupNo === groupNo).map((m) => m.userId),
      now,
      {
        unplayed: competition.unplayedRule,
        points: competition.points,
        walkoverWinsBreakTies: competition.walkoverWinsBreakTies,
      },
      competition.tieBreaks,
      nameOf,
    ).map((r) => r.id),
  )
  const seeds = qualifierSeeds(ranked, competition.advancing)
  if (seeds.length < 2) {
    return seeds[0] ? finish(tx, competition.id, seeds[0], now) : null
  }
  // knockout rounds number on from the group stage, so "a later round exists" holds
  const round = Math.max(...groupGames.map((m) => m.round)) + 1
  const dueAt = new Date(now.getTime() + competition.matchdayDays * DAY)
  await tx.insert(matches).values(
    knockoutLegs(
      generateKnockoutRound1(seeds).map((m) => ({ ...m, round })),
      1,
    ).map((m) => ({
      competitionId: competition.id,
      round: m.round,
      position: m.position,
      leg: m.leg,
      homeUserId: m.homeId,
      awayUserId: m.awayId,
      byeUserId: m.byeId,
      opensAt: lastResultAt(groupGames, now),
      dueAt,
    })),
  )
  return null
}

/** A group game once the bracket is drawn from the group results: fixed. */
async function groupStageClosed(
  tx: Tx | typeof db,
  competition: { id: string; format: string },
  match: { groupNo: number | null },
) {
  if (competition.format !== 'groups' || match.groupNo === null) return false
  const [bracket] = await tx
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(eq(matches.competitionId, competition.id), isNull(matches.groupNo)),
    )
    .limit(1)
  return Boolean(bracket)
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
    if (!competition) throw new UserError('Not found.')
    authorize('manage', {
      role: roleOf(viewer, competition, false),
      isAdmin: viewer.isAdmin,
      visibility: competition.visibility,
    })
    if (competition.status !== 'running') {
      throw new UserError('Only a running competition takes decisions.')
    }
    const [match] = await tx
      .select()
      .from(matches)
      .where(
        and(eq(matches.id, matchId), eq(matches.competitionId, competition.id)),
      )
      .limit(1)
    if (!match?.homeUserId || !match.awayUserId) {
      throw new UserError('That match has no two players to decide.')
    }
    // a groups competition's bracket games are knockout games
    const knockout =
      competition.format === 'knockout' ||
      (competition.format === 'groups' && match.groupNo === null)
    const singleGame =
      knockout && (competition.format === 'groups' || competition.legs === 1)
    if (await groupStageClosed(tx, competition, match)) {
      throw new UserError('The group stage is over; its results are final.')
    }
    if (knockout && decision.kind === 'void') {
      throw new UserError(
        'Someone has to go through: award a walkover instead.',
      )
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
        throw new UserError('The next round has started; this tie is final.')
      }
    }
    // a home & away leg can be drawn: the aggregate decides the tie
    const fields = decisionFields(
      decision,
      { ...match, homeUserId: match.homeUserId, awayUserId: match.awayUserId },
      singleGame,
    )
    await tx
      .update(matches)
      .set({ ...fields, note })
      .where(eq(matches.id, match.id))
    // a reopened game was never searched: chess.com is read again before its
    // deadline can settle it
    if (decision.kind === 'reopen' && competition.readThrough) {
      const before = new Date(match.dueAt.getTime() - 1)
      if (competition.readThrough > before) {
        await tx
          .update(competitions)
          .set({ readThrough: before })
          .where(eq(competitions.id, competition.id))
      }
    }
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
    // after the results, so a game just read stays where it was played; not
    // counted as a result: its players get their own "moved" notification
    await tidyLateGames(id).catch((error) => {
      console.error('[fixtures] tidy failed', id, (error as Error).message)
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
    if (!competition) throw new UserError('Not found.')
    if (competition.status !== 'running') {
      throw new UserError('Only a running competition takes walkovers.')
    }
    const [match] = await tx
      .select()
      .from(matches)
      .where(
        and(eq(matches.id, matchId), eq(matches.competitionId, competition.id)),
      )
      .limit(1)
    if (!match) throw new UserError('Not found.')
    if (await groupStageClosed(tx, competition, match)) {
      throw new UserError('The group stage is over; its results are final.')
    }
    const opponent = concedeTo(match, viewer.id)
    // only if still open: a result or decision in the meantime wins
    const written = await tx
      .update(matches)
      .set({ winnerUserId: opponent, note: CONCEDED, report: null })
      .where(
        and(
          eq(matches.id, match.id),
          isNull(matches.result),
          isNull(matches.winnerUserId),
        ),
      )
      .returning({ id: matches.id })
    if (written.length === 0)
      throw new UserError('That match is already decided.')
    return { competitionId: competition.id, opponent }
  })
  await advance(done.competitionId)
  await notifyConceded(done.competitionId, viewer.id, done.opponent)
}

/**
 * One of the two players says how their game went (for a game chess.com
 * won't show us: over the board, elsewhere online). It stands once the
 * opponent confirms it; until then the match stays open.
 */
export async function reportResult(
  slug: string,
  viewer: Viewer,
  matchId: string,
  outcome: 'win' | 'draw' | 'loss',
  reporterWhite: boolean,
) {
  const reported = await db.transaction(async (tx) => {
    const { competition, match, singleGame } = await openMatch(
      tx,
      slug,
      matchId,
    )
    const report = reportFor(match, viewer.id, outcome, reporterWhite)
    // fail now on what confirming couldn't record (a drawn knockout tie)
    decisionFields(
      { kind: 'result', result: report.result, homeWhite: report.homeWhite },
      match,
      singleGame,
    )
    if (match.opensAt > new Date()) {
      throw new UserError("This match hasn't opened yet.")
    }
    await tx.update(matches).set({ report }).where(eq(matches.id, match.id))
    const opponent =
      match.homeUserId === viewer.id ? match.awayUserId : match.homeUserId
    return { competitionId: competition.id, opponent }
  })
  await notifyReported(reported.competitionId, viewer.id, reported.opponent)
}

/** The opponent confirms a reported result (it stands) or disputes it. */
export async function answerReport(
  slug: string,
  viewer: Viewer,
  matchId: string,
  accept: boolean,
  seen: Pick<MatchReport, 'result' | 'homeWhite'>,
) {
  const answered = await db.transaction(async (tx) => {
    const { competition, match, singleGame } = await openMatch(
      tx,
      slug,
      matchId,
    )
    const report = match.report
    if (!report) throw new UserError('There is no reported result to answer.')
    const opponent =
      report.byUserId === match.homeUserId ? match.awayUserId : match.homeUserId
    if (viewer.id !== opponent) {
      throw new UserError(
        'Only the opponent can confirm or dispute this result.',
      )
    }
    if (report.result !== seen.result || report.homeWhite !== seen.homeWhite) {
      throw new UserError('The report changed. Check it again.')
    }
    await tx
      .update(matches)
      .set(
        accept
          ? decisionFields(
              {
                kind: 'result',
                result: report.result,
                homeWhite: report.homeWhite,
              },
              match,
              singleGame,
            )
          : { report: null },
      )
      .where(eq(matches.id, match.id))
    return { competitionId: competition.id, reporter: report.byUserId }
  })
  if (accept) await advance(answered.competitionId)
  await notifyReportAnswered(
    answered.competitionId,
    viewer.id,
    answered.reporter,
    accept,
  )
}

/** A running competition's undecided match with two players, locked. */
async function openMatch(tx: Tx, slug: string, matchId: string) {
  const [competition] = await tx
    .select()
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .for('update')
  if (!competition) throw new UserError('Not found.')
  if (competition.status !== 'running') {
    throw new UserError('Only a running competition takes results.')
  }
  const [row] = await tx
    .select()
    .from(matches)
    .where(
      and(eq(matches.id, matchId), eq(matches.competitionId, competition.id)),
    )
    .limit(1)
  if (!row?.homeUserId || !row.awayUserId) throw new UserError('Not found.')
  if (row.result || row.winnerUserId || row.voided) {
    throw new UserError('That match is already decided.')
  }
  if (await groupStageClosed(tx, competition, row)) {
    throw new UserError('The group stage is over; its results are final.')
  }
  const knockout =
    competition.format === 'knockout' ||
    (competition.format === 'groups' && row.groupNo === null)
  const singleGame =
    knockout && (competition.format === 'groups' || competition.legs === 1)
  const match = {
    ...row,
    homeUserId: row.homeUserId,
    awayUserId: row.awayUserId,
  }
  return { competition, match, singleGame }
}
