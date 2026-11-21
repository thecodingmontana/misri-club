/**
 * A player's own chess.com games, reduced to what the analysis page needs.
 */

/** The fields of a chess.com archive game we read (see chesscom.server). */
export interface ArchiveGame {
  url: string
  /** unix seconds */
  end_time: number
  rules?: string
  time_class?: string
  pgn?: string
  eco?: string
  white: { username: string; result: string; rating?: number }
  black: { username: string; result: string; rating?: number }
}

/** How many games a player can pick to analyse. */
export const GAME_COUNTS = [5, 10, 20, 50] as const

export interface MyGame {
  chessComUrl: string
  pgn: string
  colour: 'white' | 'black'
  outcome: 'win' | 'draw' | 'loss'
  opponent: string
  opponentRating: number | null
  /** e.g. "Queens Pawn Opening", or the time class when chess.com gives none */
  label: string
  /** unix ms */
  endedAt: number
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

/** `…/openings/Queens-Pawn-Opening-2.Bf4` → "Queens Pawn Opening" */
export function openingName(eco: string | undefined): string | null {
  const slug = eco?.split('/openings/')[1]
  if (!slug) return null
  return decodeURIComponent(slug)
    .replace(/-\d+\..*$/, '')
    .replaceAll('-', ' ')
}

/** The game from `username`'s side, or null if it can't be analysed. */
export function toMyGame(game: ArchiveGame, username: string): MyGame | null {
  if ((game.rules ?? 'chess') !== 'chess' || !game.pgn) return null
  const name = username.toLowerCase()
  const colour =
    game.white.username.toLowerCase() === name
      ? 'white'
      : game.black.username.toLowerCase() === name
        ? 'black'
        : null
  if (!colour) return null
  const me = game[colour]
  const them = game[colour === 'white' ? 'black' : 'white']

  return {
    chessComUrl: game.url,
    pgn: game.pgn,
    colour,
    outcome:
      me.result === 'win' ? 'win' : DRAWS.has(me.result) ? 'draw' : 'loss',
    opponent: them.username,
    opponentRating: them.rating ?? null,
    label: openingName(game.eco) ?? game.time_class ?? 'chess',
    endedAt: game.end_time * 1000,
  }
}

/** Newest first, at most `count`, from any number of archive months. */
export function latestGames(
  games: Array<ArchiveGame>,
  username: string,
  count: number,
): Array<MyGame> {
  return games
    .map((game) => toMyGame(game, username))
    .filter((game): game is MyGame => game !== null)
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, count)
}
