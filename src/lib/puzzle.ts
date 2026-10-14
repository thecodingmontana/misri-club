import { Chess } from 'chess.js'

/** The fields we use from `GET https://lichess.org/api/puzzle/next`. */
export interface LichessPuzzle {
  game: { pgn: string }
  puzzle: {
    id: string
    rating: number
    /** UCI moves, the player's first, then alternating with the replies. */
    solution: Array<string>
    themes: Array<string>
  }
}

/** The puzzle's position: every move of the game up to it, played out. */
export function puzzleStart(pgn: string): Chess {
  const chess = new Chess()
  for (const san of pgn.split(' ')) chess.move(san)
  return chess
}

/** `e7e8q` → the move object chess.js takes. */
export function fromUci(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }
}

export type Verdict =
  | { kind: 'wrong' }
  /** `reply` is the opponent's answer to play next; null when solved. */
  | { kind: 'right'; fen: string; reply: string | null }

/**
 * Judges the player's move at `step` of the solution. Any checkmate counts
 * too, as on Lichess, since a mate-in-one often has more than one answer.
 */
export function judgeMove(
  fen: string,
  solution: Array<string>,
  step: number,
  from: string,
  to: string,
): Verdict {
  const expected = solution[step]
  const chess = new Chess(fen)
  // The board has no promotion picker: take the solution's piece, else a queen.
  const promotion = expected.startsWith(from + to) ? expected[4] : 'q'

  let lan: string
  try {
    lan = chess.move({ from, to, promotion }).lan
  } catch {
    return { kind: 'wrong' }
  }

  if (chess.isCheckmate())
    return { kind: 'right', fen: chess.fen(), reply: null }
  if (lan !== expected) return { kind: 'wrong' }
  return { kind: 'right', fen: chess.fen(), reply: solution[step + 1] ?? null }
}
