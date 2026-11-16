/**
 * Groups then knockout: players drawn into groups snake-style by seed (so the
 * top seeds are spread out), a round robin in each, then the top N of every
 * group into a bracket seeded so group-mates can't meet in its first round.
 */

export const GROUP_COUNTS = [2, 4, 8] as const
export const ADVANCING = [1, 2] as const

/** Seed order in, groups out: 1→A, 2→B, …, then back the other way. */
export function drawGroups<Id>(seeded: Id[], groupCount: number): Id[][] {
  const groups: Id[][] = Array.from({ length: groupCount }, () => [])
  seeded.forEach((id, i) => {
    const lap = Math.floor(i / groupCount)
    const slot = i % groupCount
    groups[lap % 2 === 0 ? slot : groupCount - 1 - slot].push(id)
  })
  return groups
}

/**
 * The bracket's seed list from each group's final order: every winner, then
 * every runner-up, in group order. Seeded 1 v last, 2 v second-last…, this
 * pairs A1 with another group's runner-up, never their own.
 */
export function qualifierSeeds<Id>(
  rankedGroups: Id[][],
  advancing: number,
): Id[] {
  const seeds: Id[] = []
  for (let place = 0; place < advancing; place++) {
    for (const group of rankedGroups) {
      if (group[place] !== undefined) seeds.push(group[place])
    }
  }
  return seeds
}

/** "A", "B", … */
export const groupName = (index: number) => String.fromCharCode(65 + index)

/** Why these settings can't make a groups competition, or null when they can. */
export function groupsProblem(
  players: number,
  groupCount: number,
  advancing: number,
) {
  if (players < groupCount * 2) {
    return `${groupCount} groups need at least ${groupCount * 2} players.`
  }
  if (Math.floor(players / groupCount) <= advancing) {
    return 'Each group needs more players than go through.'
  }
  return null
}
