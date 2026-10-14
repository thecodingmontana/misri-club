import { Chess } from 'chess.js'

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
 * A typed move (`Nf3`, `e4`, `e2e4`) as squares, or null if it isn't legal
 * here. A lowercase piece letter is forgiven, since phones lowercase the first
 * key; `b` is left alone because `bxc3` is a pawn move.
 */
export function parseMove(fen: string, text: string) {
  const typed = text.trim()
  for (const attempt of [
    typed,
    typed.replace(/^[nrqk]/, (c) => c.toUpperCase()),
  ]) {
    try {
      const move = new Chess(fen).move(attempt)
      return { from: move.from, to: move.to }
    } catch {
      // Try the next reading.
    }
  }
  return null
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
