import { db } from '@misri/db/client'
import {
  chessAccounts,
  competitionMembers,
  competitions,
  matches,
  user,
} from '@misri/db/schema'
import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Viewer } from './access.ts'
import { matchOutcome, type Outcome } from './standings.ts'

/**
 * A player's page: their competitions, record, recent results and their
 * head-to-head with you. Only competitions you could see anyway count:
 * public ones, ones you're in, or all of them for an admin.
 */

const RECENT = 10

export type PlayerResult = {
  matchId: string
  outcome: Outcome
  /** awarded or forfeited without a game */
  walkover: boolean
  opponent: string
  opponentImage: string | null
  opponentId: string
  competition: string
  slug: string
  endedAt: number | null
}

export type WinRecord = {
  wins: number
  draws: number
  losses: number
}

/** Pure: W/D/L from outcomes; a forfeit is a loss. */
export function recordOf(outcomes: Outcome[]): WinRecord {
  return {
    wins: outcomes.filter((o) => o === 'win').length,
    draws: outcomes.filter((o) => o === 'draw').length,
    losses: outcomes.filter((o) => o === 'loss' || o === 'forfeit').length,
  }
}

export async function getPlayer(username: string, viewer: Viewer) {
  const [player] = await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      username: chessAccounts.username,
      avatar: chessAccounts.avatar,
    })
    .from(user)
    .leftJoin(chessAccounts, eq(chessAccounts.userId, user.id))
    // by chess.com username, or by id for players without one
    .where(
      or(
        eq(chessAccounts.username, username.toLowerCase()),
        eq(user.id, username),
      ),
    )
    .limit(1)
  if (!player) return null

  const mine = db
    .select({ id: competitionMembers.competitionId })
    .from(competitionMembers)
    .where(eq(competitionMembers.userId, viewer.id))
  const visible = viewer.isAdmin
    ? sql`true`
    : or(eq(competitions.visibility, 'public'), inArray(competitions.id, mine))

  const theirs = await db
    .select({
      slug: competitions.slug,
      name: competitions.name,
      format: competitions.format,
      status: competitions.status,
      championUserId: competitions.championUserId,
    })
    .from(competitionMembers)
    .innerJoin(
      competitions,
      eq(competitions.id, competitionMembers.competitionId),
    )
    .where(and(eq(competitionMembers.userId, player.id), visible))
    .orderBy(desc(competitions.createdAt))

  const opponent = alias(user, 'opponent')
  const opponentAccount = alias(chessAccounts, 'opponent_account')
  const opponentId = sql<string>`case when ${matches.homeUserId} = ${player.id} then ${matches.awayUserId} else ${matches.homeUserId} end`
  const decided = await db
    .select({
      id: matches.id,
      homeUserId: matches.homeUserId,
      awayUserId: matches.awayUserId,
      dueAt: matches.dueAt,
      result: matches.result,
      whiteUserId: matches.whiteUserId,
      winnerUserId: matches.winnerUserId,
      voided: matches.voided,
      endedAt: matches.endedAt,
      competition: competitions.name,
      slug: competitions.slug,
      opponentId,
      opponentName: sql<string>`coalesce(${opponentAccount.username}, ${opponent.name}, 'A former player')`,
      opponentImage: sql<
        string | null
      >`coalesce(nullif(${opponentAccount.avatar}, ''), ${opponent.image})`,
    })
    .from(matches)
    .innerJoin(competitions, eq(competitions.id, matches.competitionId))
    .leftJoin(opponent, eq(opponent.id, opponentId))
    .leftJoin(opponentAccount, eq(opponentAccount.userId, opponentId))
    .where(
      and(
        or(
          eq(matches.homeUserId, player.id),
          eq(matches.awayUserId, player.id),
        ),
        isNotNull(matches.homeUserId),
        isNotNull(matches.awayUserId),
        or(isNotNull(matches.result), isNotNull(matches.winnerUserId)),
        eq(matches.voided, false),
        visible,
      ),
    )
    .orderBy(sql`${matches.endedAt} desc nulls last`, desc(matches.dueAt))

  const results: PlayerResult[] = decided.flatMap((m) => {
    // decided matches only: the members and time arguments never come into it
    const outcome = matchOutcome(m, player.id, new Set(), new Date(0))
    return outcome
      ? [
          {
            matchId: m.id,
            outcome,
            // awarded or forfeited, not a game anyone played
            walkover: !m.result,
            opponent: m.opponentName,
            opponentImage: m.opponentImage,
            opponentId: m.opponentId,
            competition: m.competition,
            slug: m.slug,
            endedAt: m.endedAt?.getTime() ?? null,
          },
        ]
      : []
  })

  return {
    player: {
      name: player.username ?? player.name,
      image: player.avatar || player.image,
      chessUsername: player.username,
      isYou: player.id === viewer.id,
    },
    record: recordOf(results.map((r) => r.outcome)),
    /** games actually played: walkovers either way don't count */
    played: results.filter((r) => !r.walkover).length,
    headToHead:
      player.id === viewer.id
        ? null
        : recordOf(
            results
              .filter((r) => r.opponentId === viewer.id)
              .map((r) => r.outcome),
          ),
    titles: theirs.filter((c) => c.championUserId === player.id).length,
    competitions: theirs.map(({ championUserId, ...c }) => ({
      ...c,
      won: championUserId === player.id,
    })),
    recent: results.slice(0, RECENT),
  }
}
