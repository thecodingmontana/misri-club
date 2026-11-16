/**
 * Reads a match's result from chess.com games: the first game between the two
 * players (either colour) that ended inside the match window counts.
 */

import { fitsTimeControl } from './time-control.ts'

export interface ChessGame {
  url: string
  /** unix seconds */
  end_time: number
  white: { username: string; result: string }
  black: { username: string; result: string }
  /** "chess" for standard games; variants (chess960, …) never count */
  rules?: string
  time_class?: string
  time_control?: string
}

export interface MatchWindow {
  /** chess.com usernames, any case */
  home: string
  away: string
  opensAt: Date
  dueAt: Date
  /** the competition's time control (lib/time-control); default any */
  timeControl?: string
}

export interface FoundResult {
  result: 'white' | 'black' | 'draw'
  /** which of the two played white */
  homeWasWhite: boolean
  gameUrl: string
  endedAt: Date
}

// chess.com's result codes that end a game level rather than with a winner
const DRAWS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
])

function outcome(game: ChessGame): FoundResult['result'] | null {
  if (game.white.result === 'win') return 'white'
  if (game.black.result === 'win') return 'black'
  if (DRAWS.has(game.white.result) || DRAWS.has(game.black.result)) {
    return 'draw'
  }
  // aborted or unknown: not a result
  return null
}

export function findMatchResult(
  games: ChessGame[],
  match: MatchWindow,
): FoundResult | null {
  const home = match.home.toLowerCase()
  const away = match.away.toLowerCase()
  const candidates = games
    .filter((g) => {
      const white = g.white.username.toLowerCase()
      const black = g.black.username.toLowerCase()
      const ended = g.end_time * 1000
      return (
        ((white === home && black === away) ||
          (white === away && black === home)) &&
        ended >= match.opensAt.getTime() &&
        ended <= match.dueAt.getTime() &&
        (g.rules ?? 'chess') === 'chess' &&
        fitsTimeControl(match.timeControl ?? 'any', g)
      )
    })
    .sort((a, b) => a.end_time - b.end_time)
  for (const game of candidates) {
    const result = outcome(game)
    if (!result) continue
    return {
      result,
      homeWasWhite: game.white.username.toLowerCase() === home,
      gameUrl: game.url,
      endedAt: new Date(game.end_time * 1000),
    }
  }
  return null
}

/** The chess.com monthly archives (YYYY/MM) a window touches, up to `until`. */
export function archiveMonths(from: Date, until: Date): string[] {
  const months: string[] = []
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
  )
  while (cursor <= until) {
    months.push(
      `${cursor.getUTCFullYear()}/${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
    )
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return months
}
