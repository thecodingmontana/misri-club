import { Chess } from 'chess.js'
import { z } from 'zod'

export type Colour = 'white' | 'black'
export type Outcome = 'win' | 'draw' | 'loss'

/** Stockfish strengths, weakest first; thinking time grows with skill. */
export const LEVELS = [
  { label: 'Beginner', skill: 0, ms: 100 },
  { label: 'Casual', skill: 5, ms: 200 },
  { label: 'Club', skill: 10, ms: 400 },
  { label: 'Strong', skill: 15, ms: 700 },
  { label: 'Max', skill: 20, ms: 1000 },
] as const

export function loadGame(pgn: string): Chess {
  const chess = new Chess()
  if (pgn) chess.loadPgn(pgn)
  return chess
}

/** The finished game's result for the player, or null while it goes on. */
export function outcomeFor(chess: Chess, colour: Colour): Outcome | null {
  if (chess.isCheckmate()) {
    // The side to move is the side that got mated.
    return chess.turn() === colour[0] ? 'loss' : 'win'
  }
  return chess.isGameOver() ? 'draw' : null
}

/** Undoes back to the player's previous turn: their move and the reply. */
export function takeBack(pgn: string, colour: Colour): string {
  const chess = loadGame(pgn)
  chess.undo()
  if (chess.turn() !== colour[0]) chess.undo()
  return chess.pgn()
}

/**
 * The game with Stockfish's `uci` reply played, or null if the game moved on
 * since it was asked about `fen`. Positions are compared, not PGN text: a new
 * game is stored as '' but writes back with headers.
 */
export function withReply(
  pgn: string,
  fen: string,
  uci: string,
): string | null {
  const chess = loadGame(pgn)
  if (chess.fen() !== fen) return null
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  return chess.pgn()
}

/** Where the game against Stockfish, and the record, are kept in the browser. */
export const PLAY_KEY = 'misri:play:v1'

export const savedGame = z.object({
  pgn: z.string(),
  colour: z.enum(['white', 'black']),
  level: z
    .number()
    .int()
    .min(0)
    .max(LEVELS.length - 1),
  /** Results per level, so a player can see how they fare at each. */
  record: z.record(
    z.string(),
    z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
  ),
  /** the player gave this game up: a loss, over before checkmate */
  resigned: z.boolean().optional(),
})
export type SavedGame = z.infer<typeof savedGame>
