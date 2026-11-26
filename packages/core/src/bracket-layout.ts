import type { MatchView } from './competition-view.ts'

/**
 * The whole knockout, drawn from day one: every round to the final, with the
 * ties that exist and numbered placeholders for the ones still to come.
 * Tie k of a round is fed by ties 2k and 2k+1 of the round before.
 */

export interface LayoutMatch {
  round: number
  position: number
  dueAt: number
  /** home & away ties: 1, 2, and 3 for a decider */
  leg?: number
}

export interface Slot<M> {
  /** 1-based across the whole bracket, for "Winner of match 3" */
  number: number
  match: M | null
  /** every game of the tie, in leg order (one, unless home & away) */
  legs: M[]
  /** the two earlier ties this one waits on (round 2 onwards) */
  feeds: [number, number] | null
}

export interface LayoutRound<M> {
  round: number
  name: string
  /** the round's deadline, when its ties exist */
  dueAt: number | null
  slots: Slot<M>[]
}

export function roundName(ties: number) {
  if (ties === 1) return 'Final'
  if (ties === 2) return 'Semi-finals'
  if (ties === 4) return 'Quarter-finals'
  return `Round of ${ties * 2}`
}

export function bracketLayout<M extends LayoutMatch>(
  matches: M[],
): LayoutRound<M>[] {
  // a tie is its first leg: home & away second legs and deciders aren't more ties
  const first = matches.filter((m) => m.round === 1 && (m.leg ?? 1) === 1)
  if (first.length === 0) return []
  const rounds: LayoutRound<M>[] = []
  let number = 1
  for (let round = 1, ties = first.length; ties >= 1; round++, ties /= 2) {
    const inRound = matches.filter((m) => m.round === round)
    // older rounds have no positions (all 0): place their ties in order rather than hide them
    const firstLegs = inRound.filter((m) => (m.leg ?? 1) === 1)
    const positioned =
      new Set(inRound.map((m) => m.position)).size === firstLegs.length
    const legsAt = (position: number) =>
      positioned
        ? inRound
            .filter((m) => m.position === position)
            .sort((a, b) => (a.leg ?? 1) - (b.leg ?? 1))
        : firstLegs[position]
          ? [firstLegs[position]]
          : []
    const previous = rounds.at(-1)
    const slots: Slot<M>[] = Array.from({ length: ties }, (_, position) => ({
      number: number++,
      match: legsAt(position)[0] ?? null,
      legs: legsAt(position),
      feeds: previous
        ? [
            previous.slots[position * 2].number,
            previous.slots[position * 2 + 1].number,
          ]
        : null,
    }))
    rounds.push({
      round,
      name: roundName(ties),
      dueAt: inRound.length ? Math.max(...inRound.map((m) => m.dueAt)) : null,
      slots,
    })
    if (ties === 1) break
  }
  return rounds
}

function winnerOf(match: MatchView) {
  return match.bye?.id ?? match.winnerId
}

/** One game's points for a player: 1, ½, 0, or null while it's open. */
export function legPoints(m: MatchView, playerId: string): number | null {
  if (m.status === 'void') return null
  if (m.result === 'draw') return 0.5
  const winner =
    m.winnerId ??
    (m.homeWon === null ? null : m.homeWon ? m.home?.id : m.away?.id)
  if (!winner) return null
  return winner === playerId ? 1 : 0
}

/** Points with halves as "1½", for aggregate scores. */
export const halves = (n: number) =>
  n % 1 ? `${Math.floor(n) || ''}½` : String(n)

/**
 * A tie's state: one game (its winner), or home & away (the aggregate, with
 * a decider counted in; level and nothing open means the organiser decides).
 */
export function tieOf(legs: MatchView[]) {
  const [first] = legs
  if (!first || legs.length < 2 || !first.home || !first.away) {
    return { winner: first ? winnerOf(first) : null, aggregate: null }
  }
  const total = (id: string) =>
    legs.reduce((sum, m) => sum + (legPoints(m, id) ?? 0), 0)
  const home = total(first.home.id)
  const away = total(first.away.id)
  const open = legs.some(
    (m) => m.status !== 'void' && legPoints(m, first.home?.id ?? '') === null,
  )
  const winner =
    open || home === away ? null : home > away ? first.home.id : first.away.id
  return {
    winner,
    aggregate: { [first.home.id]: home, [first.away.id]: away } as Record<
      string,
      number
    >,
  }
}
