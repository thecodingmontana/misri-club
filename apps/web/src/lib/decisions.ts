import type { matches } from '#/db/schema'

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

const CLEARED = {
  result: null,
  winnerUserId: null,
  voided: false,
  whiteUserId: null,
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
  if (!homeUserId || !awayUserId) throw new Error('That match has no opponent.')
  if (playerId !== homeUserId && playerId !== awayUserId) {
    throw new Error("You're not playing in that match.")
  }
  if (match.result !== null || match.winnerUserId !== null || match.voided) {
    throw new Error('That match is already decided.')
  }
  return playerId === homeUserId ? awayUserId : homeUserId
}
