/**
 * The whole knockout, drawn from day one: every round to the final, with the
 * ties that exist and numbered placeholders for the ones still to come.
 * Tie k of a round is fed by ties 2k and 2k+1 of the round before.
 */

export interface LayoutMatch {
  round: number
  position: number
  dueAt: number
}

export interface Slot<M> {
  /** 1-based across the whole bracket, for "Winner of match 3" */
  number: number
  match: M | null
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
  const first = matches.filter((m) => m.round === 1)
  if (first.length === 0) return []
  const rounds: LayoutRound<M>[] = []
  let number = 1
  for (let round = 1, ties = first.length; ties >= 1; round++, ties /= 2) {
    const inRound = matches.filter((m) => m.round === round)
    const previous = rounds.at(-1)
    const slots: Slot<M>[] = Array.from({ length: ties }, (_, position) => ({
      number: number++,
      match: inRound.find((m) => m.position === position) ?? null,
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
