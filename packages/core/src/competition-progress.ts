import type { BracketMatch } from './bracket.ts'
import { challengeScore } from './challenge.ts'

/**
 * Where a running competition stands once results change: still going,
 * waiting on the organiser, ready for the next knockout round, or finished.
 */

export interface ProgressMatch {
  round: number
  position: number
  homeUserId: string | null
  awayUserId: string | null
  byeUserId: string | null
  result: string | null
  winnerUserId: string | null
  voided: boolean
  dueAt: Date
  /** 1 or 2 for home & away ties; 3 is a decider */
  leg?: number
  whiteUserId?: string | null
}

/**
 * A league is complete when every pairing is settled: played, awarded, called
 * off, or expired under a rule that settles it by itself ("both lose it" /
 * "no result"). Under "I decide" an expired game waits for the organiser.
 */
export function leagueComplete(
  matches: ProgressMatch[],
  memberIds: Set<string>,
  unplayedRule: 'organiser' | 'both_forfeit' | 'void',
  now: Date,
): boolean {
  const pairings = matches.filter((m) => m.homeUserId && m.awayUserId)
  if (pairings.length === 0) return false
  return pairings.every((m) => {
    if (m.result || m.winnerUserId || m.voided) return true
    // someone who left can't play it; it never counts
    if (
      !memberIds.has(m.homeUserId as string) ||
      !memberIds.has(m.awayUserId as string)
    ) {
      return true
    }
    return m.dueAt <= now && unplayedRule !== 'organiser'
  })
}

export type KnockoutStep =
  | { kind: 'waiting' }
  | { kind: 'next'; matches: BracketMatch[] }
  | { kind: 'champion'; userId: string }
  /** two-leg ties level on aggregate: each needs a deciding game */
  | {
      kind: 'deciders'
      ties: Array<{
        round: number
        position: number
        homeId: string
        awayId: string
      }>
    }

/**
 * Who a tie sends through: a bye, the single game's winner, or (home & away)
 * whoever leads on aggregate. 'decider' = level after both legs; null = not yet.
 */
function tieWinner(legs: ProgressMatch[]): string | null | 'decider' {
  const [first] = legs
  if (first.byeUserId) return first.byeUserId
  if (legs.length === 1) return first.winnerUserId
  const home = first.homeUserId as string
  const away = first.awayUserId as string
  const score = challengeScore(
    legs.map((l) => ({ ...l, whiteUserId: l.whiteUserId ?? null })),
    home,
    away,
  )
  if (score.open > 0) return null
  if (score.a !== score.b) return score.a > score.b ? home : away
  // level even after the decider: the organiser awards it
  return legs.some((l) => (l.leg ?? 1) >= 3) ? null : 'decider'
}

/**
 * The latest round decides: all ties settled → next round, or the champion.
 * `gone` are players who left: a tie they already won sends their opponent
 * through instead, and a lone survivor in a pairing gets a bye.
 */
export function knockoutStep(
  matches: ProgressMatch[],
  gone: Set<string> = new Set(),
): KnockoutStep {
  if (matches.length === 0) return { kind: 'waiting' }
  const latest = Math.max(...matches.map((m) => m.round))
  // ties in bracket order (neighbours meet next), each with its legs in order
  const byPosition = new Map<number, ProgressMatch[]>()
  for (const m of matches.filter((x) => x.round === latest)) {
    byPosition.set(m.position, [...(byPosition.get(m.position) ?? []), m])
  }
  const ties = [...byPosition.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, legs]) => legs.sort((a, b) => (a.leg ?? 1) - (b.leg ?? 1)))
  const winners = ties.map(tieWinner)
  const deciders = ties.filter((_, i) => winners[i] === 'decider')
  if (deciders.length > 0) {
    return {
      kind: 'deciders',
      ties: deciders.map(([first]) => ({
        round: first.round,
        position: first.position,
        homeId: first.homeUserId as string,
        awayId: first.awayUserId as string,
      })),
    }
  }
  if (winners.some((w) => !w)) return { kind: 'waiting' }
  const through = ties.map(([first], i) => {
    const winner = winners[i] as string
    if (!gone.has(winner)) return winner
    const other =
      winner === first.homeUserId ? first.awayUserId : first.homeUserId
    return other && !gone.has(other) ? other : null
  })
  if (ties.length === 1) {
    return through[0]
      ? { kind: 'champion', userId: through[0] }
      : { kind: 'waiting' }
  }
  const next: BracketMatch[] = []
  for (let i = 0; i < through.length; i += 2) {
    const [home, away] = [through[i], through[i + 1] ?? null]
    // shortcut: two leavers side by side leave an empty slot; rare enough to wait for the organiser
    if (!home && !away) return { kind: 'waiting' }
    next.push(
      home && away
        ? { round: latest + 1, homeId: home, awayId: away, byeId: null }
        : {
            round: latest + 1,
            homeId: null,
            awayId: null,
            byeId: home ?? away,
          },
    )
  }
  return { kind: 'next', matches: next }
}
