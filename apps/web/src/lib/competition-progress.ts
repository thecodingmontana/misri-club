import type { BracketMatch } from './bracket.ts'

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

/**
 * The latest round decides: all winners known → next round, or the champion.
 * `gone` are players who left: a tie they already won sends their opponent
 * through instead, and a lone survivor in a pairing gets a bye.
 */
export function knockoutStep(
  matches: ProgressMatch[],
  gone: Set<string> = new Set(),
): KnockoutStep {
  if (matches.length === 0) return { kind: 'waiting' }
  const latest = Math.max(...matches.map((m) => m.round))
  // in bracket order: neighbours meet next, whatever order the rows came in
  const round = matches
    .filter((m) => m.round === latest)
    .sort((a, b) => a.position - b.position)
  if (round.some((m) => !(m.byeUserId ?? m.winnerUserId))) {
    return { kind: 'waiting' }
  }
  const through = round.map((m) => {
    const winner = (m.byeUserId ?? m.winnerUserId) as string
    if (!gone.has(winner)) return winner
    const other = winner === m.homeUserId ? m.awayUserId : m.homeUserId
    return other && !gone.has(other) ? other : null
  })
  if (round.length === 1) {
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
