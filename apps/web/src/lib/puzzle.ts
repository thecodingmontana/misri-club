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
 * Lichess puzzle themes to train, by their Lichess `angle`; each one was
 * checked to return puzzles tagged with it.
 */
export const THEMES = {
  fork: 'Forks',
  pin: 'Pins',
  skewer: 'Skewers',
  discoveredAttack: 'Discovered attacks',
  doubleCheck: 'Double checks',
  deflection: 'Deflection',
  attraction: 'Attraction',
  xRayAttack: 'X-ray attacks',
  intermezzo: 'In-between moves',
  hangingPiece: 'Hanging pieces',
  trappedPiece: 'Trapped pieces',
  sacrifice: 'Sacrifices',
  quietMove: 'Quiet moves',
  defensiveMove: 'Defensive moves',
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  backRankMate: 'Back-rank mates',
  smotheredMate: 'Smothered mates',
  kingsideAttack: 'King-side attacks',
  attackingF2F7: 'Attacking f2 and f7',
  exposedKing: 'Exposed king',
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
  promotion: 'Promotion',
} as const

export type Theme = keyof typeof THEMES

/** The picker's sections. */
export const THEME_GROUPS: Array<{ label: string; themes: Array<Theme> }> = [
  {
    label: 'Tactics',
    themes: [
      'fork',
      'pin',
      'skewer',
      'discoveredAttack',
      'doubleCheck',
      'deflection',
      'attraction',
      'xRayAttack',
      'intermezzo',
      'hangingPiece',
      'trappedPiece',
    ],
  },
  {
    label: 'Brilliant ideas',
    themes: ['sacrifice', 'quietMove', 'defensiveMove'],
  },
  {
    label: 'Checkmates',
    themes: ['mateIn1', 'mateIn2', 'mateIn3', 'backRankMate', 'smotheredMate'],
  },
  {
    label: 'Attack',
    themes: ['kingsideAttack', 'attackingF2F7', 'exposedKing'],
  },
  {
    label: 'Game phase',
    themes: ['opening', 'middlegame', 'endgame', 'promotion'],
  },
]

/** Relative to the visitor's puzzle rating, which is 1500 when signed out. */
export const DIFFICULTIES = [
  'easiest',
  'easier',
  'normal',
  'harder',
  'hardest',
] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/**
 * A random puzzle from Lichess (CORS-open, no key), checked before use: its
 * shape by the schema, and its moves by replaying the game and the solution,
 * so a bad one fails here as a load error rather than mid-solve. Offline, one
 * of the puzzles kept on this device instead.
 */
export async function fetchPuzzle({
  theme,
  difficulty,
}: {
  theme?: Theme
  difficulty?: Difficulty
} = {}) {
  let puzzle: LichessPuzzle
  try {
    puzzle = await fetchLichess(theme, difficulty)
    void topUpStash(theme, difficulty)
  } catch (error) {
    // offline (or Lichess down): one of the puzzles kept on this device
    const kept = fromStash(theme, difficulty)
    if (!kept) {
      throw navigator.onLine
        ? error
        : new Error(
            "You're offline, and no puzzles are saved on this device yet.",
          )
    }
    puzzle = kept
  }
  return { ...puzzle, start: puzzleStart(puzzle) }
}

async function fetchLichess(theme?: Theme, difficulty?: Difficulty) {
  const params = new URLSearchParams()
  if (theme) params.set('angle', theme)
  if (difficulty) params.set('difficulty', difficulty)
  const response = await fetch(
    `https://lichess.org/api/puzzle/next?${params}`,
    {
      headers: { Accept: 'application/json' },
    },
  )
  if (!response.ok) throw new Error(`Lichess answered ${response.status}.`)
  const puzzle = lichessPuzzle.parse(await response.json())
  puzzleStart(puzzle) // throws on moves that don't replay: never kept
  stash(puzzle, theme, difficulty)
  return puzzle
}

// --- Puzzles kept for offline -------------------------------------------
// Every puzzle fetched is kept (the newest STASH_SIZE), tagged with what was
// asked for, so offline there's still something to solve.

const STASH_KEY = 'misri-puzzles'
const STASH_SIZE = 60
const TOP_UP = 5

type Stashed = { puzzle: LichessPuzzle; theme?: Theme; difficulty?: Difficulty }

function readStash(): Stashed[] {
  try {
    return JSON.parse(localStorage.getItem(STASH_KEY) ?? '[]') as Stashed[]
  } catch {
    return []
  }
}

function stash(puzzle: LichessPuzzle, theme?: Theme, difficulty?: Difficulty) {
  const kept = readStash().filter(
    (s) => s.puzzle.puzzle.id !== puzzle.puzzle.id,
  )
  kept.unshift({ puzzle, theme, difficulty })
  try {
    localStorage.setItem(STASH_KEY, JSON.stringify(kept.slice(0, STASH_SIZE)))
  } catch {
    // storage full or blocked: offline puzzles just aren't kept
  }
}

/** A kept puzzle, as close to what was asked for as there is. */
export function fromStash(theme?: Theme, difficulty?: Difficulty) {
  const kept = readStash()
  const pool = [
    kept.filter((s) => s.theme === theme && s.difficulty === difficulty),
    kept.filter((s) => s.theme === theme),
    theme ? [] : kept,
  ].find((p) => p.length > 0)
  if (!pool) return null
  return pool[Math.floor(Math.random() * pool.length)].puzzle
}

let toppingUp = false
/** While online, keeps a few more of this kind for later. */
async function topUpStash(theme?: Theme, difficulty?: Difficulty) {
  const have = readStash().filter(
    (s) => s.theme === theme && s.difficulty === difficulty,
  ).length
  if (toppingUp || have >= TOP_UP * 2) return
  toppingUp = true
  try {
    for (let i = 0; i < TOP_UP; i++) await fetchLichess(theme, difficulty)
  } catch {
    // best effort
  } finally {
    toppingUp = false
  }
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
