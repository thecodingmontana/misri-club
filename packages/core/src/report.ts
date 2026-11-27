import { Chess } from 'chess.js'
import {
  type MoveClass,
  moveAccuracy,
  type Phase,
  positionsOf,
  reviewFor,
  type Score,
} from './analysis.ts'

/**
 * The full report on one analysed game, for one side: accuracy overall and by
 * phase, what went wrong how often, and every move that cost something with
 * the move Stockfish preferred. The lesson picks the turning points; this is
 * the move-by-move detail under it.
 */

export interface Improvement {
  ply: number
  moveNumber: number
  played: string
  /** Stockfish's move instead, in SAN; null when it gave none */
  best: string | null
  kind: Exclude<MoveClass, 'good'>
  /** win chance given away, 0–100 */
  dropped: number
  phase: Phase
}

export interface GameReport {
  accuracy: number
  counts: Record<Exclude<MoveClass, 'good'>, number>
  phases: Array<{ phase: Phase; accuracy: number; moves: number }>
  improvements: Array<Improvement>
}

const PHASES: Array<Phase> = ['opening', 'middlegame', 'endgame']

/** Stockfish's UCI move as SAN in the position it was for. */
function sanOf(fen: string, uci: string | undefined) {
  if (!uci) return null
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    }).san
  } catch {
    return null
  }
}

export function gameReport(
  pgn: string,
  colour: 'white' | 'black',
  scores: Array<Score>,
): GameReport {
  const positions = positionsOf(pgn)
  const review = reviewFor(colour, positions, scores)
  const counts = { blunder: 0, mistake: 0, inaccuracy: 0 }
  const improvements: Array<Improvement> = []
  for (const move of review.moves) {
    if (move.kind === 'good') continue
    counts[move.kind]++
    improvements.push({
      ply: move.ply,
      moveNumber: Math.floor(move.ply / 2) + 1,
      played: move.san,
      best: sanOf(positions.fens[move.ply], scores[move.ply]?.best),
      kind: move.kind,
      dropped: move.dropped,
      phase: move.phase,
    })
  }
  const phases = PHASES.flatMap((phase) => {
    const moves = review.moves.filter((m) => m.phase === phase)
    if (moves.length === 0) return []
    const accuracy =
      moves.reduce((sum, m) => sum + moveAccuracy(m.dropped), 0) / moves.length
    return [{ phase, accuracy, moves: moves.length }]
  })
  return { accuracy: review.accuracy, counts, phases, improvements }
}
