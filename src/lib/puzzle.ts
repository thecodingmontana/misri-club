import { Chess } from 'chess.js'
import { z } from 'zod'

/** The fields we use from `GET https://lichess.org/api/puzzle/next`. */
export const lichessPuzzle = z.object({
  game: z.object({ pgn: z.string().min(1) }),
  puzzle: z.object({
    id: z.string().min(1),
    rating: z.number(),
    /** UCI moves, the player's first, then alternating with the replies. */
    solution: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).min(1),
    themes: z.array(z.string()),
  }),
})

export type LichessPuzzle = z.infer<typeof lichessPuzzle>

/**
 * A random puzzle from Lichess (CORS-open, no key), checked before use: its
 * shape by the schema, and its moves by replaying the game and the solution,
 * so a bad one fails here as a load error rather than mid-solve.
 */
export async function fetchPuzzle() {
  const response = await fetch('https://lichess.org/api/puzzle/next', {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Lichess answered ${response.status}.`)
  const puzzle = lichessPuzzle.parse(await response.json())
  return { ...puzzle, start: puzzleStart(puzzle) }
}

/** Where the puzzle begins: the game played out, and whose move it is. */
export function puzzleStart({ game, puzzle }: LichessPuzzle) {
  const chess = new Chess()
  for (const san of game.pgn.split(' ')) chess.move(san)
  const last = chess.history({ verbose: true }).at(-1)
  const start = {
    fen: chess.fen(),
    colour: chess.turn() === 'w' ? ('white' as const) : ('black' as const),
    lastMove: last ? { from: last.from, to: last.to } : null,
  }
  for (const uci of puzzle.solution) chess.move(fromUci(uci))
  return start
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
