import type { Match } from '#/db/schema'

/**
 * Scoring is the organiser's call, not ours. chess.com's public API carries no
 * challenge or decline data, so when a match expires unplayed we can't tell who
 * ducked it. The organiser picks what happens (`UnplayedRule`) and what each
 * outcome is worth; a walkover they award counts as a win and a forfeit.
 */
export type Outcome = 'win' | 'draw' | 'loss' | 'forfeit'
export type Points = Record<Outcome, number>
export const POINTS: Points = { win: 3, draw: 1, loss: 0, forfeit: -1 }

/**
 * organiser = it waits for the organiser to award a walkover or void it;
 * both_forfeit = both take the forfeit; void = it simply doesn't count.
 */
export const UNPLAYED_RULES = ['organiser', 'both_forfeit', 'void'] as const
export type UnplayedRule = (typeof UNPLAYED_RULES)[number]

export interface Rules {
  unplayed: UnplayedRule
  points: Points
}
export const DEFAULT_RULES: Rules = { unplayed: 'organiser', points: POINTS }

export interface Tally {
  points: number
  wins: number
  draws: number
  losses: number
  forfeits: number
}

/**
 * A game counts for a match when it is between the same two players (either
 * colour) and finished inside the match's window, both ends included.
 */
export function fitsMatch(
  game: { whiteUserId: string; blackUserId: string; endedAt: Date },
  match: Pick<Match, 'homeUserId' | 'awayUserId' | 'opensAt' | 'dueAt'>,
): boolean {
  return (
    game.endedAt >= match.opensAt &&
    game.endedAt <= match.dueAt &&
    ((match.homeUserId === game.whiteUserId &&
      match.awayUserId === game.blackUserId) ||
      (match.homeUserId === game.blackUserId &&
        match.awayUserId === game.whiteUserId))
  )
}

const COUNTER = {
  win: 'wins',
  draw: 'draws',
  loss: 'losses',
  forfeit: 'forfeits',
} as const

export type ScoredMatch = Pick<
  Match,
  | 'homeUserId'
  | 'awayUserId'
  | 'dueAt'
  | 'result'
  | 'whiteUserId'
  | 'winnerUserId'
>

/**
 * What one match means for one of its players, or null while it means nothing
 * yet. The table and the fixture cards both read this, so they cannot disagree.
 */
export function matchOutcome(
  match: ScoredMatch,
  userId: string,
  members: Set<string>,
  now: Date,
  unplayed: UnplayedRule = DEFAULT_RULES.unplayed,
): Outcome | null {
  if (!match.homeUserId || !match.awayUserId) return null

  if (match.result) {
    if (match.result === 'draw') return 'draw'
    return (match.result === 'white') === (match.whiteUserId === userId)
      ? 'win'
      : 'loss'
  }

  if (match.winnerUserId) {
    return match.winnerUserId === userId ? 'win' : 'forfeit'
  }

  // Still open, or not yet started — no consequence until the window shuts.
  if (match.dueAt > now) return null
  // Someone who left can't play; their opponent isn't to blame.
  if (!members.has(match.homeUserId) || !members.has(match.awayUserId)) {
    return null
  }
  // Otherwise only the organiser's own rule gives it a consequence.
  return unplayed === 'both_forfeit' ? 'forfeit' : null
}

/** Pure: the table a league's matches add up to. */
export function tallyStandings(
  matches: Array<ScoredMatch>,
  memberIds: Array<string>,
  now: Date,
  rules: Rules = DEFAULT_RULES,
): Map<string, Tally> {
  const tally = new Map<string, Tally>()
  const members = new Set(memberIds)

  const row = (userId: string) => {
    let entry = tally.get(userId)
    if (!entry) {
      entry = { points: 0, wins: 0, draws: 0, losses: 0, forfeits: 0 }
      tally.set(userId, entry)
    }
    return entry
  }

  // Every member starts on zero so the table shows the whole field.
  for (const id of memberIds) row(id)

  for (const match of matches) {
    if (!match.homeUserId || !match.awayUserId) continue
    for (const userId of [match.homeUserId, match.awayUserId]) {
      const outcome = matchOutcome(match, userId, members, now, rules.unplayed)
      if (!outcome) continue
      const entry = row(userId)
      entry[COUNTER[outcome]]++
      entry.points += rules.points[outcome]
    }
  }

  return tally
}
