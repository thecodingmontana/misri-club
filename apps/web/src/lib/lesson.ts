import type { Move, Square } from 'chess.js'
import { Chess } from 'chess.js'
import type { MoveReview, Phase } from './analysis'
import { positionsOf, reviewFor } from './analysis.ts'
import type { Score } from './engine'

/**
 * A coaching lesson built from one game with no AI: Stockfish says which
 * moves went wrong and what was better, chess.js says what kind of mistake it
 * was (a missed mate, a piece left hanging, a missed forcing move), and each
 * kind has a hand-written lesson. Same game, same lesson, every time.
 */

export type Pattern = 'missed-mate' | 'hung-piece' | 'missed-tactic' | 'drift'

export interface LessonMoment {
  ply: number
  moveNumber: number
  /** Position before the player's move. */
  fen: string
  played: MoveStep
  best: MoveStep | null
  /** The opponent's strongest answer to the move that was played. */
  reply: MoveStep | null
  dropped: number
  phase: Phase
  pattern: Pattern
  heading: string
  theory: string
  prompt: string
  /** Undefended pieces (either side) that are attacked in this position. */
  hanging: Array<Square>
}

/** A move and the position it leads to, for stepping through on a board. */
export interface MoveStep {
  san: string
  from: Square
  to: Square
  after: string
}

const step = (m: Move): MoveStep => ({
  san: m.san,
  from: m.from,
  to: m.to,
  after: m.after,
})

export interface QuizQuestion {
  question: string
  options: Array<string>
  answer: number
  explanation: string
}

export interface Lesson {
  pattern: Pattern | null
  title: string
  mentalModel: string
  summary: string
  principle: { heading: string; body: string }
  moments: Array<LessonMoment>
  quiz: Array<QuizQuestion>
  accuracy: number
}

const PIECE: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

interface Context {
  played: string
  best: string | null
  reply: string | null
  piece: string
  moveNumber: number
  pct: number
}

const TEMPLATES: Record<
  Pattern,
  {
    title: string
    mentalModel: string
    principle: { heading: string; body: string }
    heading: (c: Context) => string
    theory: (c: Context) => string
    concept: QuizQuestion
  }
> = {
  'missed-mate': {
    title: 'Finish the Game: Look for Mate First',
    mentalModel:
      'When the enemy king is exposed, check every forcing move for mate before anything else.',
    principle: {
      heading: 'Checks, Captures, Threats — In That Order',
      body: 'Before every move, scan in a fixed order: can I give check? Can I capture? Can I make a big threat? Mating patterns hide among the checks, and a missed mate turns a won game back into a fight.',
    },
    heading: (c) => `Move ${c.moveNumber} — Mate Was on the Board`,
    theory: (c) =>
      `${c.best ?? 'A forcing line'} led to mate. ${c.played} let the king escape. When mate is there, nothing else on the board matters.`,
    concept: {
      question: 'What should you check first when the enemy king is exposed?',
      options: [
        'Every check, to see whether one of them mates',
        'Which of your pawns can advance safely',
        'Whether you can trade queens',
      ],
      answer: 0,
      explanation:
        'Checks are the most forcing moves, and every mate starts with one. Look at all of them first.',
    },
  },
  'hung-piece': {
    title: 'Count Before You Commit: No Free Pieces',
    mentalModel:
      'Before you let go of a piece, ask what your opponent can capture next, and whether it is defended.',
    principle: {
      heading: 'The Blunder Check',
      body: 'Most club games are decided by a piece left undefended. Before every move, look at each square your opponent attacks. If something of yours stands there without a defender, deal with it first.',
    },
    heading: (c) =>
      `Move ${c.moveNumber} — ${c.played} Left Your ${capitalize(c.piece)} Hanging`,
    theory: (c) =>
      `After ${c.played}, ${c.reply ?? 'your opponent'} wins your ${c.piece}.${c.best ? ` ${c.best} kept everything protected.` : ''}`,
    concept: {
      question: 'What is the last thing to check before you play a move?',
      options: [
        'Whether the move looks aggressive',
        'What your opponent can capture after it, and whether it is defended',
        'How much time is left on your clock',
      ],
      answer: 1,
      explanation:
        'The blunder check: look at everything your opponent attacks after your move. An undefended piece there is a free gift.',
    },
  },
  'missed-tactic': {
    title: 'Forcing Moves First',
    mentalModel:
      'Checks and captures come first: look at every forcing move before you play a quiet one.',
    principle: {
      heading: 'The Forcing-Move Hierarchy',
      body: 'Every turn, ask in order: can I give check? Can I capture? Can I threaten something big? Forcing moves take away your opponent’s choices, and that is where material is won. A quiet move hands the initiative back for free.',
    },
    heading: (c) =>
      `Move ${c.moveNumber} — You Missed ${c.best ?? 'a Forcing Move'}`,
    theory: (c) =>
      `${c.best ?? 'A forcing move'} was there and wins out of this position. ${c.played} let your opponent off the hook.`,
    concept: {
      question: 'Why look at checks and captures before quiet moves?',
      options: [
        'They are always the best moves',
        'They limit your opponent’s replies, which is where material is won',
        'They use less time on the clock',
      ],
      answer: 1,
      explanation:
        'Forcing moves narrow what your opponent can do. That is what makes tactics work, so they are the first place to look.',
    },
  },
  drift: {
    title: 'Every Move Needs a Job',
    mentalModel:
      'Before moving, name what the move does: attack, defend, or improve your worst piece.',
    principle: {
      heading: 'Purposeful Moves',
      body: 'A move without a job lets your opponent take over. Improve your worst-placed piece, take space, or remove a threat. If a move does none of these, look again.',
    },
    heading: (c) => `Move ${c.moveNumber} — ${c.played} Drifted`,
    theory: (c) =>
      `${c.played} gave away ${c.pct}% of your winning chances.${c.best ? ` ${c.best} kept the pressure on.` : ''}`,
    concept: {
      question: 'Your move has no clear purpose. What do you do?',
      options: [
        'Play it anyway to save time',
        'Look for a move that attacks, defends, or improves your worst piece',
        'Push a pawn on the edge of the board',
      ],
      answer: 1,
      explanation:
        'Every move should do a job. If you cannot name one, there is usually a better move.',
    },
  },
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function playUci(fen: string, uci: string | undefined): Move | null {
  if (!uci) return null
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    })
  } catch {
    return null
  }
}

/** Pieces (not kings) attacked by the other side and defended by none of their own. */
export function hangingSquares(fen: string): Array<Square> {
  const chess = new Chess(fen)
  const out: Array<Square> = []
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type === 'k') continue
      const enemy = piece.color === 'w' ? 'b' : 'w'
      if (
        chess.attackers(piece.square, enemy).length > 0 &&
        chess.attackers(piece.square, piece.color).length === 0
      ) {
        out.push(piece.square)
      }
    }
  }
  return out
}

function patternOf(
  ply: number,
  fens: Array<string>,
  scores: Array<Score>,
  bestMove: Move | null,
): { pattern: Pattern; reply: Move | null } {
  const before = scores[ply]
  const after = scores[ply + 1]
  const moverIsWhite = ply % 2 === 0
  const mating = (s: Score) =>
    'mate' in s && (moverIsWhite ? s.mate > 0 : s.mate < 0)

  if (mating(before) && !mating(after)) {
    return { pattern: 'missed-mate', reply: null }
  }

  const reply = playUci(fens[ply + 1], after.best)
  if (reply?.captured && reply.captured !== 'p') {
    return { pattern: 'hung-piece', reply }
  }

  if (bestMove && (bestMove.captured || bestMove.san.includes('+'))) {
    return { pattern: 'missed-tactic', reply }
  }

  return { pattern: 'drift', reply }
}

/** A third, plausible option for the "find the move" question. */
function decoy(fen: string, exclude: Array<string>): string | null {
  const moves = new Chess(fen).moves({ verbose: true })
  const forcing = moves.find(
    (m) => !exclude.includes(m.san) && (m.captured || m.san.includes('+')),
  )
  return (forcing ?? moves.find((m) => !exclude.includes(m.san)))?.san ?? null
}

/** Rotate options by ply so the right answer isn't always in the same place. */
function arrange(options: Array<string>, correct: string, seed: number) {
  const shift = seed % options.length
  const rotated = [...options.slice(shift), ...options.slice(0, shift)]
  return { options: rotated, answer: rotated.indexOf(correct) }
}

export function buildLesson(input: {
  pgn: string
  colour: 'white' | 'black'
  scores: Array<Score>
  opponent: string
  outcome: 'win' | 'draw' | 'loss'
}): Lesson {
  const positions = positionsOf(input.pgn)
  const { fens, sans } = positions
  const review = reviewFor(input.colour, positions, input.scores)

  const serious = review.moves
    .filter((m) => m.kind === 'blunder' || m.kind === 'mistake')
    .sort((a, b) => b.dropped - a.dropped)
  const picked: Array<MoveReview> =
    serious.length > 0
      ? serious.slice(0, 2)
      : review.moves
          .filter((m) => m.kind === 'inaccuracy')
          .sort((a, b) => b.dropped - a.dropped)
          .slice(0, 1)
  picked.sort((a, b) => a.ply - b.ply)

  const moments: Array<LessonMoment> = []
  for (const move of picked) {
    const played = new Chess(fens[move.ply]).move(sans[move.ply])
    const bestMove = playUci(fens[move.ply], input.scores[move.ply].best)
    const bestIsPlayed = bestMove?.san === played.san
    const { pattern, reply } = patternOf(
      move.ply,
      fens,
      input.scores,
      bestIsPlayed ? null : bestMove,
    )
    const context: Context = {
      played: played.san,
      best: bestMove && !bestIsPlayed ? bestMove.san : null,
      reply: reply?.san ?? null,
      piece: PIECE[reply?.captured ?? 'p'],
      moveNumber: Math.floor(move.ply / 2) + 1,
      pct: Math.round(move.dropped),
    }
    const template = TEMPLATES[pattern]

    moments.push({
      ply: move.ply,
      moveNumber: context.moveNumber,
      fen: fens[move.ply],
      played: step(played),
      best: bestMove && !bestIsPlayed ? step(bestMove) : null,
      reply: reply ? step(reply) : null,
      dropped: move.dropped,
      phase: move.phase,
      pattern,
      heading: template.heading(context),
      theory: template.theory(context),
      prompt: `${capitalize(input.colour)} to move. Before you look at what was played, find the strongest move yourself.`,
      hanging: hangingSquares(fens[move.ply]),
    })
  }

  const worst = [...moments].sort((a, b) => b.dropped - a.dropped)[0]
  const pattern = worst?.pattern ?? null
  const template = pattern ? TEMPLATES[pattern] : null
  const accuracy = Math.round(review.accuracy * 10) / 10
  const result = input.outcome

  const quiz: Array<QuizQuestion> = moments.map((m) => {
    const correct = m.best?.san ?? m.played.san
    const options = [correct, m.played.san]
    const extra = decoy(m.fen, options)
    if (extra) options.push(extra)
    const arranged = arrange([...new Set(options)], correct, m.ply)
    return {
      question: `Move ${m.moveNumber}: which move is strongest here?`,
      ...arranged,
      explanation: m.best
        ? `${m.best.san} is Stockfish's choice. ${m.played.san}, the move you played, gave away ${Math.round(m.dropped)}% of your winning chances.`
        : `${m.played.san} was already the best try in this position.`,
    }
  })
  if (template) quiz.push(template.concept)

  return {
    pattern,
    title: template?.title ?? 'A Clean Game',
    mentalModel:
      template?.mentalModel ??
      'Keep doing what worked: check forcing moves first and blunder-check before every move.',
    summary: worst
      ? `In your ${result} vs ${input.opponent} you averaged ${accuracy}% accuracy. Your biggest slip came in the ${worst.phase} on move ${worst.moveNumber}, where ${worst.played.san} gave away ${Math.round(worst.dropped)}% of your winning chances. One habit would have changed that moment: ${(template?.mentalModel ?? '').charAt(0).toLowerCase()}${(template?.mentalModel ?? '').slice(1)}`
      : `In your ${result} vs ${input.opponent} you averaged ${accuracy}% accuracy, with no serious mistakes. Stockfish found nothing that cost you more than a few percent.`,
    principle: template?.principle ?? {
      heading: 'Keep the Habits',
      body: 'No mistake in this game cost you real winning chances. The habits that got you here — looking at forcing moves first and checking what your opponent can capture — are the ones to keep.',
    },
    moments,
    quiz,
    accuracy,
  }
}

/** One position from your own game where you went wrong: find Stockfish's move. */
export interface MistakePuzzle {
  id: string
  fen: string
  /** Stockfish's move, UCI */
  solution: string
  colour: 'white' | 'black'
  /** the opponent's move that led here, to show on the board */
  lastMove: { from: string; to: string } | null
  gameUrl: string
  opponent: string
  moveNumber: number
}

/** Every blunder and mistake you made in an analysed game, as a one-move puzzle. */
export function mistakePuzzles(
  game: {
    chessComUrl: string
    pgn: string
    colour: 'white' | 'black'
    opponent: string
  },
  scores: Array<Score>,
): Array<MistakePuzzle> {
  const positions = positionsOf(game.pgn)
  const { fens, sans } = positions
  return reviewFor(game.colour, positions, scores)
    .moves.filter((m) => m.kind === 'blunder' || m.kind === 'mistake')
    .flatMap((move) => {
      const best = scores[move.ply]?.best
      const bestMove = playUci(fens[move.ply], best)
      if (!best || !bestMove || bestMove.san === sans[move.ply]) return []
      const previous =
        move.ply > 0
          ? new Chess(fens[move.ply - 1]).move(sans[move.ply - 1])
          : null
      return [
        {
          id: `${game.chessComUrl}#${move.ply}`,
          fen: fens[move.ply],
          solution: best,
          colour: game.colour,
          lastMove: previous ? { from: previous.from, to: previous.to } : null,
          gameUrl: game.chessComUrl,
          opponent: game.opponent,
          moveNumber: Math.floor(move.ply / 2) + 1,
        },
      ]
    })
}
