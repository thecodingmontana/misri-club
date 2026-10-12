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

    const home = row(fixture.homePlayerId)
    const away = row(fixture.awayPlayerId)
    const game = gameByFixture.get(fixture.id)

    if (!game && fixture.walkoverWinnerId) {
      const [winner, loser] =
        fixture.walkoverWinnerId === fixture.homePlayerId
          ? [home, away]
          : [away, home]
      winner.wins++
      winner.points += POINTS.win
      loser.forfeits++
      loser.points += POINTS.forfeit
      continue
    }

    if (!game) {
      // Still open, or not yet started — no consequence until the window shuts.
      if (fixture.dueAt > now) continue
      // Someone who left the club can't play; their opponent isn't to blame.
      if (!active.has(fixture.homePlayerId) || !active.has(fixture.awayPlayerId)) {
        continue
      }

      home.forfeits++
      away.forfeits++
      home.points += POINTS.forfeit
      away.points += POINTS.forfeit
      continue
    }

    const white = game.whitePlayerId === fixture.homePlayerId ? home : away
    const black = white === home ? away : home

    if (game.result === 'draw') {
      white.draws++
      black.draws++
      white.points += POINTS.draw
      black.points += POINTS.draw
      continue
    }

    const [winner, loser] =
      game.result === 'white' ? [white, black] : [black, white]
    winner.wins++
    winner.points += POINTS.win
    loser.losses++
    loser.points += POINTS.loss
  }

  return tally
}
