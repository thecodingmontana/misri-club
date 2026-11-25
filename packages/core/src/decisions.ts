import type { MatchReport, matches } from '@misri/db/schema'
import { UserError } from './errors.ts'

// How a result or an organiser's decision turns into a match row. Pure, so
// the rules are tested without a database.

const DAY = 24 * 60 * 60 * 1000

/** Who won a decided result, given who had white. */
export function winnerOf(
  result: 'white' | 'black' | 'draw',
  whiteUserId: string,
  blackUserId: string,
) {
  if (result === 'draw') return null
  return result === 'white' ? whiteUserId : blackUserId
}

export type Decision =
  | { kind: 'result'; result: 'white' | 'black' | 'draw'; homeWhite: boolean }
  | { kind: 'walkover'; winnerUserId: string }
  | { kind: 'void' }
  | { kind: 'extend'; days: number }
  | { kind: 'reopen' }

// any decision also settles a player's pending report
const CLEARED = {
  result: null,
  winnerUserId: null,
  voided: false,
  whiteUserId: null,
  report: null,
}

/** What a decision writes to the match row (throws when it isn't allowed). */
export function decisionFields(
  decision: Decision,
  match: { homeUserId: string; awayUserId: string; dueAt: Date },
  knockout: boolean,
  now = Date.now(),
): Partial<typeof matches.$inferInsert> {
  const { homeUserId, awayUserId } = match
  switch (decision.kind) {
    case 'result': {
      if (knockout && decision.result === 'draw') {
        throw new UserError(
          'A tournament tie needs a winner: award a walkover.',
        )
      }
      const whiteUserId = decision.homeWhite ? homeUserId : awayUserId
      const blackUserId = decision.homeWhite ? awayUserId : homeUserId
      return {
        ...CLEARED,
        result: decision.result,
        endedAt: new Date(now),
        whiteUserId,
        winnerUserId: knockout
          ? winnerOf(decision.result, whiteUserId, blackUserId)
          : null,
      }
    }
    case 'walkover':
      if (![homeUserId, awayUserId].includes(decision.winnerUserId)) {
        throw new UserError('The walkover goes to one of the two players.')
      }
      return {
        ...CLEARED,
        winnerUserId: decision.winnerUserId,
        endedAt: new Date(now),
      }
    case 'void':
      if (knockout) {
        throw new UserError(
          'Someone has to go through: award a walkover instead.',
        )
      }
      return { ...CLEARED, voided: true }
    case 'extend': {
      const from = Math.max(match.dueAt.getTime(), now)
      return { dueAt: new Date(from + decision.days * DAY), remindedAt: null }
    }
    case 'reopen':
      return { ...CLEARED, gameUrl: null, endedAt: null }
  }
}

/**
 * A player gives their opponent the walkover (they know they can't play).
 * Returns the opponent; throws when this player can't concede this match.
 */
export function concedeTo(
  match: {
    homeUserId: string | null
    awayUserId: string | null
    result: string | null
    winnerUserId: string | null
    voided: boolean
  },
  playerId: string,
): string {
  const { homeUserId, awayUserId } = match
  if (!homeUserId || !awayUserId)
    throw new UserError('That match has no opponent.')
  if (playerId !== homeUserId && playerId !== awayUserId) {
    throw new UserError("You're not playing in that match.")
  }
  if (match.result !== null || match.winnerUserId !== null || match.voided) {
    throw new UserError('That match is already decided.')
  }
  return playerId === homeUserId ? awayUserId : homeUserId
}

/** The note a player's own walkover leaves on the match (not the organiser's word). */
export const CONCEDED = 'Conceded by the player'

export type { MatchReport }

/**
 * "I won / drew / lost, with white / black" from one of the two players, as
 * the result it means. Throws for anyone else.
 */
export function reportFor(
  match: { homeUserId: string; awayUserId: string },
  reporterId: string,
  outcome: 'win' | 'draw' | 'loss',
  reporterWhite: boolean,
): MatchReport {
  if (![match.homeUserId, match.awayUserId].includes(reporterId)) {
    throw new UserError('Only the two players can report this result.')
  }
  const reporterHome = match.homeUserId === reporterId
  return {
    byUserId: reporterId,
    result:
      outcome === 'draw'
        ? 'draw'
        : (outcome === 'win') === reporterWhite
          ? 'white'
          : 'black',
    homeWhite: reporterHome === reporterWhite,
  }
}

/**
 * Whether a match is waiting on the organiser: expired under "I decide" (any
 * expired tie in a knockout), or a drawn knockout tie that still needs a winner.
 */
export function awaitsDecision(
  m: Pick<
    typeof matches.$inferSelect,
    | 'homeUserId'
    | 'awayUserId'
    | 'voided'
    | 'winnerUserId'
    | 'groupNo'
    | 'result'
    | 'leg'
    | 'dueAt'
  >,
  competition: {
    format: string
    legs: number
    unplayedRule: string
  },
  now: number,
) {
  if (!m.homeUserId || !m.awayUserId || m.voided || m.winnerUserId) {
    return false
  }
  const knockout =
    competition.format === 'knockout' ||
    (competition.format === 'groups' && m.groupNo === null)
  // a drawn leg is fine (the aggregate decides); a drawn tie or decider needs a winner
  if (knockout && m.result === 'draw') {
    return (
      competition.format === 'groups' || competition.legs === 1 || m.leg >= 3
    )
  }
  if (m.result) return false
  return (
    m.dueAt.getTime() <= now &&
    (knockout || competition.unplayedRule === 'organiser')
  )
}
