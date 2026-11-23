/**
 * A 1v1 challenge: two players, best of N games. A win is a point, a draw
 * half each, a walkover a point to whoever got it. It's over as soon as
 * one player can't be caught; level after every game is a drawn match.
 */

export interface ChallengeGame {
  result: string | null
  whiteUserId: string | null
  winnerUserId: string | null
  voided: boolean
}

export type ChallengeOutcome =
  | { kind: 'going' }
  | { kind: 'won'; userId: string }
  | { kind: 'drawn' }

export function challengeScore(games: ChallengeGame[], a: string, b: string) {
  let scoreA = 0
  let scoreB = 0
  let open = 0
  for (const g of games) {
    if (g.voided) continue
    if (g.result === 'draw') {
      scoreA += 0.5
      scoreB += 0.5
    } else if (g.result && g.whiteUserId) {
      const whiteWon = g.result === 'white'
      const winner = whiteWon ? g.whiteUserId : g.whiteUserId === a ? b : a
      if (winner === a) scoreA++
      else scoreB++
    } else if (g.winnerUserId) {
      if (g.winnerUserId === a) scoreA++
      else scoreB++
    } else {
      open++
    }
  }
  return { a: scoreA, b: scoreB, open }
}

export function challengeOutcome(
  games: ChallengeGame[],
  a: string,
  b: string,
): ChallengeOutcome {
  const score = challengeScore(games, a, b)
  if (score.a - score.b > score.open) return { kind: 'won', userId: a }
  if (score.b - score.a > score.open) return { kind: 'won', userId: b }
  if (score.open === 0) return { kind: 'drawn' }
  return { kind: 'going' }
}

export const BEST_OF = [1, 3, 5, 7] as const
