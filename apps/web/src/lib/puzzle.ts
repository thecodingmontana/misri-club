import {
  type Difficulty,
  fetchLichessPuzzle,
  type LichessPuzzle,
  puzzleStart,
  type Theme,
} from '@misri/core/puzzle'

// The puzzle rules live in @misri/core (the app shares them); this adds the
// website's offline stash.
export {
  DIFFICULTIES,
  type Difficulty,
  fromUci,
  judgeMove,
  type LichessPuzzle,
  lichessPuzzle,
  puzzleStart,
  THEME_GROUPS,
  THEMES,
  type Theme,
  type Verdict,
} from '@misri/core/puzzle'

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
  const puzzle = await fetchLichessPuzzle(theme, difficulty)
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
