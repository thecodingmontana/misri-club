import type { Fixture, Game } from '#/db/schema'

/**
 * Scoring. A fixture that expires unplayed costs **both** players a point —
 * chess.com's public API carries no challenge or decline data, so there is no
 * honest way to decide which of the two failed to arrange it. Punishing both is
 * the only rule the available data supports, and it still makes ducking a game
 * strictly worse than losing one. When an admin knows who turned up, they award
 * a walkover instead: a win's points to one, a forfeit to the other.
 */
export const POINTS = { win: 3, draw: 1, loss: 0, forfeit: -1 } as const

export interface Tally {
  points: number
  wins: number
  draws: number
  losses: number
  forfeits: number
}

/**
 * A game counts for a fixture when it is between the same two players (either
 * colour) and finished inside the fixture's window, both ends included.
 */
export function fitsFixture(
  game: Pick<Game, 'whitePlayerId' | 'blackPlayerId' | 'endedAt'>,
  fixture: Pick<Fixture, 'homePlayerId' | 'awayPlayerId' | 'opensAt' | 'dueAt'>,
): boolean {
  return (
    game.endedAt >= fixture.opensAt &&
    game.endedAt <= fixture.dueAt &&
    ((fixture.homePlayerId === game.whitePlayerId &&
      fixture.awayPlayerId === game.blackPlayerId) ||
      (fixture.homePlayerId === game.blackPlayerId &&
        fixture.awayPlayerId === game.whitePlayerId))
  )
}

export type Outcome = 'win' | 'draw' | 'loss' | 'forfeit'

const COUNTER = {
  win: 'wins',
  draw: 'draws',
  loss: 'losses',
  forfeit: 'forfeits',
} as const

/**
 * What one fixture means for one of its players, or null while it means
 * nothing yet. The standings and the leaderboard grid both read this, so the
 * points and the cells cannot disagree.
 */
export function fixtureOutcome(
  fixture: Pick<
    Fixture,
    'homePlayerId' | 'awayPlayerId' | 'dueAt' | 'walkoverWinnerId'
  >,
  game: { whitePlayerId: number | null; result: Game['result'] } | null,
  playerId: number,
  active: Set<number>,
  now: Date,
): Outcome | null {
  if (!fixture.homePlayerId || !fixture.awayPlayerId) return null

  if (game) {
    if (game.result === 'draw') return 'draw'
    return (game.result === 'white') === (game.whitePlayerId === playerId)
      ? 'win'
      : 'loss'
  }

  if (fixture.walkoverWinnerId) {
    return fixture.walkoverWinnerId === playerId ? 'win' : 'forfeit'
  }

  // Still open, or not yet started — no consequence until the window shuts.
  if (fixture.dueAt > now) return null
  // Someone who left the club can't play; their opponent isn't to blame.
  if (!active.has(fixture.homePlayerId) || !active.has(fixture.awayPlayerId)) {
    return null
  }
  return 'forfeit'
}

/** Pure: the standings a season's fixtures and linked games add up to. */
export function tallyStandings(
  fixtures: Array<
    Pick<
      Fixture,
      'id' | 'homePlayerId' | 'awayPlayerId' | 'dueAt' | 'walkoverWinnerId'
    >
  >,
  games: Array<Pick<Game, 'fixtureId' | 'whitePlayerId' | 'result'>>,
  activePlayerIds: Array<number>,
  now: Date,
): Map<number, Tally> {
  const gameByFixture = new Map(games.map((game) => [game.fixtureId, game]))
  const tally = new Map<number, Tally>()
  const active = new Set(activePlayerIds)

  const row = (playerId: number) => {
    let entry = tally.get(playerId)
    if (!entry) {
      entry = { points: 0, wins: 0, draws: 0, losses: 0, forfeits: 0 }
      tally.set(playerId, entry)
    }
    return entry
  }

  // Everyone active starts on zero so the board shows the whole field.
  for (const id of activePlayerIds) row(id)

  for (const fixture of fixtures) {
    if (!fixture.homePlayerId || !fixture.awayPlayerId) continue
    const game = gameByFixture.get(fixture.id) ?? null

    for (const playerId of [fixture.homePlayerId, fixture.awayPlayerId]) {
      const entry = row(playerId)
      const outcome = fixtureOutcome(fixture, game, playerId, active, now)
      if (!outcome) continue
      entry[COUNTER[outcome]]++
      entry.points += POINTS[outcome]
    }
  }

  return tally
}
