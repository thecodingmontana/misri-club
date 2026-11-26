/**
 * Single-elimination brackets. Round 1 fills the field up to a power of two
 * with byes, which go to the top seeds (earliest in the list). Seeds sit in the
 * standard bracket order (1 v 8, 4 v 5, 2 v 7, 3 v 6), so the top two can only
 * meet in the final; later rounds pair winners in that order.
 */

export interface BracketMatch {
  round: number
  homeId: string | null
  awayId: string | null
  byeId: string | null
}

/** Seed numbers (1-based) in bracket slot order for a field of `size`. */
function seedOrder(size: number): Array<number> {
  let order = [1]
  while (order.length < size) {
    const next = order.length * 2 + 1
    order = order.flatMap((seed) => [seed, next - seed])
  }
  return order
}

export function generateKnockoutRound1(
  userIds: Array<string>,
): Array<BracketMatch> {
  if (userIds.length < 2) return []
  let size = 2
  while (size < userIds.length) size *= 2

  const slots = seedOrder(size)
  const matches: Array<BracketMatch> = []
  for (let i = 0; i < size; i += 2) {
    const home = userIds[slots[i] - 1]
    const away = userIds[slots[i + 1] - 1] as string | undefined
    // The lower seed of a pair is the one past the field, never the higher.
    matches.push(
      away === undefined
        ? { round: 1, homeId: null, awayId: null, byeId: home }
        : { round: 1, homeId: home, awayId: away, byeId: null },
    )
  }
  return matches
}

/** A round's ties, as rows: home & away ties get a second leg, colours swapped. */
export function knockoutLegs(
  ties: Array<{
    round: number
    homeId: string | null
    awayId: string | null
    byeId: string | null
  }>,
  legs: number,
) {
  return ties.flatMap((tie, position) => [
    { ...tie, leg: 1, position },
    ...(legs === 2 && tie.homeId && tie.awayId
      ? [{ ...tie, leg: 2, position, homeId: tie.awayId, awayId: tie.homeId }]
      : []),
  ])
}
