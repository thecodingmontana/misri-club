import { type BracketMatch, nextRound } from './bracket.ts'

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

/** The latest round decides: all winners known → next round, or the champion. */
export function knockoutStep(matches: ProgressMatch[]): KnockoutStep {
  if (matches.length === 0) return { kind: 'waiting' }
  const latest = Math.max(...matches.map((m) => m.round))
  // in bracket order: neighbours meet next, whatever order the rows came in
  const round = matches
    .filter((m) => m.round === latest)
    .sort((a, b) => a.position - b.position)
  const winners = round.map((m) => m.byeUserId ?? m.winnerUserId)
  if (winners.some((w) => !w)) return { kind: 'waiting' }
  if (round.length === 1) {
    return { kind: 'champion', userId: winners[0] as string }
  }
  return {
    kind: 'next',
    matches: nextRound(
      round.map((m) => ({
        round: m.round,
        homeId: m.homeUserId,
        awayId: m.awayUserId,
        byeId: m.byeUserId,
        winnerId: m.winnerUserId,
      })),
    ),
  }
}
