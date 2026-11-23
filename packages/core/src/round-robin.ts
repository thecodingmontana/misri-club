/**
 * Double round-robin scheduling via the circle method.
 *
 * One player is held fixed while the rest rotate; that yields `n - 1` rounds in
 * which every player meets every other exactly once. The second leg mirrors the
 * first with home and away swapped, for `2 * (n - 1)` matchdays total.
 *
 * With an odd number of players a `null` placeholder joins the circle, and
 * whoever is drawn against it that round sits out (a bye). A single-leg league
 * keeps only the `leg: 1` fixtures.
 */

export interface GeneratedFixture<Id = string> {
  matchday: number
  leg: 1 | 2
  homeId: Id | null
  awayId: Id | null
  byeId: Id | null
}

export function generateDoubleRoundRobin<Id extends string | number>(
  playerIds: Array<Id>,
): Array<GeneratedFixture<Id>> {
  if (playerIds.length < 2) return []

  const circle: Array<Id | null> = [...playerIds]
  if (circle.length % 2 !== 0) circle.push(null) // odd count -> one bye per round

  const size = circle.length
  const rounds = size - 1
  const half = size / 2

  const fixed = circle[0]
  let rotating = circle.slice(1)

  const firstLeg: Array<GeneratedFixture<Id>> = []

  for (let round = 0; round < rounds; round++) {
    const arrangement = [fixed, ...rotating]
    const matchday = round + 1

    for (let i = 0; i < half; i++) {
      const a = arrangement[i]
      const b = arrangement[size - 1 - i]

      if (a === null || b === null) {
        firstLeg.push({
          matchday,
          leg: 1,
          homeId: null,
          awayId: null,
          byeId: a ?? b,
        })
        continue
      }

      // Alternate the fixed player's colour each round so they aren't
      // permanently at home, which the naive circle method would do.
      const swap = i === 0 && round % 2 === 1
      firstLeg.push({
        matchday,
        leg: 1,
        homeId: swap ? b : a,
        awayId: swap ? a : b,
        byeId: null,
      })
    }

    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)]
  }

  const secondLeg = firstLeg.map<GeneratedFixture<Id>>((fixture) => ({
    matchday: fixture.matchday + rounds,
    leg: 2,
    homeId: fixture.awayId,
    awayId: fixture.homeId,
    byeId: fixture.byeId,
  }))

  return [...firstLeg, ...secondLeg]
}

/** Number of matchdays a season of `n` players will run to. */
export function matchdayCount(playerCount: number): number {
  if (playerCount < 2) return 0
  const size = playerCount % 2 === 0 ? playerCount : playerCount + 1
  return 2 * (size - 1)
}
