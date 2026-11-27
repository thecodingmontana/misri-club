import {
  closestPuzzle,
  type Difficulty,
  fetchLichessPuzzle,
  type LichessPuzzle,
  type Theme,
} from '@misri/core/puzzle'
import { File, Paths } from 'expo-file-system'

/**
 * Lichess puzzles kept on the phone, so Puzzles works with no connection.
 * Each online puzzle tops the stash up a little for the filters in use; with
 * no connection one comes out of it. Not personal, so it stays on sign-out.
 */

type Kept = {
  theme: Theme | null
  difficulty: Difficulty
  puzzle: LichessPuzzle
}
const MAX = 40
const PER_FILTER = 6

const file = () => new File(Paths.document, 'puzzle-stash.json')

async function read(): Promise<Kept[]> {
  try {
    const f = file()
    return f.exists ? JSON.parse(await f.text()) : []
  } catch {
    return []
  }
}

function write(list: Kept[]) {
  try {
    file().writeSync(JSON.stringify(list.slice(-MAX)))
  } catch {
    // a full disk only costs the offline puzzles
  }
}

let topping = false
/** A few more for these filters (and some general ones), one at a time. */
async function topUp(theme: Theme | undefined, difficulty: Difficulty) {
  if (topping) return
  topping = true
  try {
    const list = await read()
    const wanted: Array<[Theme | undefined, Difficulty]> = []
    const forThese = list.filter(
      (k) => k.theme === (theme ?? null) && k.difficulty === difficulty,
    ).length
    for (let i = forThese; i < PER_FILTER && wanted.length < 3; i++)
      wanted.push([theme, difficulty])
    if (list.length < 15) wanted.push([undefined, 'normal'])
    for (const [t, d] of wanted) {
      const puzzle = await fetchLichessPuzzle(t, d)
      if (list.some((k) => k.puzzle.puzzle.id === puzzle.puzzle.id)) continue
      list.push({ theme: t ?? null, difficulty: d, puzzle })
    }
    write(list)
  } catch {
    // offline or Lichess busy: the next online puzzle tries again
  } finally {
    topping = false
  }
}

/**
 * The next puzzle: from Lichess when it can be reached, else the nearest one
 * kept on the phone (`offline` then says so). Throws when there's neither.
 */
export async function nextPuzzle(
  theme: Theme | undefined,
  difficulty: Difficulty,
  online: () => Promise<LichessPuzzle> = () =>
    fetchLichessPuzzle(theme, difficulty),
) {
  try {
    const puzzle = await online()
    void topUp(theme, difficulty)
    return { puzzle, offline: false }
  } catch (error) {
    const list = await read()
    const at = closestPuzzle(list, theme, difficulty)
    if (at < 0) throw error
    const [kept] = list.splice(at, 1)
    write(list)
    return { puzzle: kept.puzzle, offline: true }
  }
}
