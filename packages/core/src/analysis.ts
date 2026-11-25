import { Chess } from 'chess.js'

/**
 * Turning engine scores into the numbers a player cares about. The win-chance
 * and accuracy curves are Lichess's published formulas, so an accuracy here
 * means roughly what it means there.
 */

/**
 * Engine verdict on a position: the score from White's point of view, and the
 * move Stockfish would play there (UCI), if any.
 */
export type Score = ({ cp: number } | { mate: number }) & { best?: string }

export type Phase = 'opening' | 'middlegame' | 'endgame'
export type MoveClass = 'blunder' | 'mistake' | 'inaccuracy' | 'good'

/** A game reduced to what the engine needs: every position, in order. */
export interface Positions {
  fens: Array<string>
  sans: Array<string>
}

export function positionsOf(pgn: string): Positions {
  const chess = new Chess()
  chess.loadPgn(pgn)
  const moves = chess.history({ verbose: true })

  return {
    fens:
      moves.length === 0
        ? [chess.fen()]
        : [moves[0].before, ...moves.map((move) => move.after)],
    sans: moves.map((move) => move.san),
  }
}

/** Chance of winning, 0–100, for White. Mates count as certain. */
export function winChance(score: Score): number {
  if ('mate' in score) return score.mate > 0 ? 100 : score.mate < 0 ? 0 : 50
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.cp)) - 1)
}

/** How good one move was, 0–100, from how much win chance it gave away. */
export function moveAccuracy(dropped: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, dropped)) - 3.1669
  return Math.min(100, Math.max(0, raw))
}

export function classify(dropped: number): MoveClass {
  if (dropped >= 30) return 'blunder'
  if (dropped >= 20) return 'mistake'
  if (dropped >= 10) return 'inaccuracy'
  return 'good'
}

/** First 10 moves each are the opening; few pieces left is an endgame. */
export function phaseOf(fen: string, ply: number): Phase {
  if (ply < 20) return 'opening'
  const board = fen.split(' ')[0]
  const pieces = board.replace(/[^nbrqNBRQ]/g, '').length
  return pieces <= 6 ? 'endgame' : 'middlegame'
}

export interface MoveReview {
  ply: number
  san: string
  phase: Phase
  dropped: number
  kind: MoveClass
}

export interface GameReview {
  accuracy: number
  moves: Array<MoveReview>
}

/**
 * One side's view of an analysed game. `scores` holds one score per position,
 * `fens.length` long, all from White's point of view.
 */
export function reviewFor(
  colour: 'white' | 'black',
  positions: Positions,
  scores: Array<Score>,
): GameReview {
  const moves: Array<MoveReview> = []
  // White moves on even plies.
  const first = colour === 'white' ? 0 : 1

  for (let ply = first; ply < positions.sans.length; ply += 2) {
    const before = winChance(scores[ply])
    const after = winChance(scores[ply + 1])
    const dropped = colour === 'white' ? before - after : after - before

    moves.push({
      ply,
      san: positions.sans[ply],
      phase: phaseOf(positions.fens[ply], ply),
      dropped,
      kind: classify(dropped),
    })
  }

  const accuracy =
    moves.length === 0
      ? 100
      : moves.reduce((sum, move) => sum + moveAccuracy(move.dropped), 0) /
        moves.length

  return { accuracy, moves }
}

export interface WeakPoints {
  blunders: number
  mistakes: number
  inaccuracies: number
  /** Phase with the most bad moves per move played, if any went wrong. */
  weakestPhase: { phase: Phase; rate: number } | null
}

export function weakPoints(reviews: Array<GameReview>): WeakPoints {
  const counts = { blunders: 0, mistakes: 0, inaccuracies: 0 }
  const byPhase: Record<Phase, { moves: number; bad: number }> = {
    opening: { moves: 0, bad: 0 },
    middlegame: { moves: 0, bad: 0 },
    endgame: { moves: 0, bad: 0 },
  }

  for (const review of reviews) {
    for (const move of review.moves) {
      byPhase[move.phase].moves++
      if (move.kind === 'blunder') counts.blunders++
      if (move.kind === 'mistake') counts.mistakes++
      if (move.kind === 'inaccuracy') counts.inaccuracies++
      if (move.kind === 'blunder' || move.kind === 'mistake') {
        byPhase[move.phase].bad++
      }
    }
  }

  let weakestPhase: WeakPoints['weakestPhase'] = null
  for (const [phase, { moves, bad }] of Object.entries(byPhase)) {
    if (moves === 0 || bad === 0) continue
    const rate = bad / moves
    if (!weakestPhase || rate > weakestPhase.rate) {
      weakestPhase = { phase: phase as Phase, rate }
    }
  }

  return { ...counts, weakestPhase }
}
