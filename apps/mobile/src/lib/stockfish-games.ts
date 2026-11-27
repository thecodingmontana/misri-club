import type { Score } from '@misri/core/analysis'
import type { Outcome } from '@misri/core/play'
import { File, Paths } from 'expo-file-system'

/**
 * Every finished game against Stockfish, kept on the phone with its review
 * once analysed, so the player can come back to it and see the trend.
 */

export type PlayedGame = {
  id: string
  pgn: string
  colour: 'white' | 'black'
  outcome: Outcome
  /** Stockfish's strength, e.g. "Club" */
  level: string
  at: number
  resigned?: boolean
  /** Stockfish's verdict on every position, once reviewed */
  scores?: Score[]
  accuracy?: number
}

const MAX = 60
const file = () => new File(Paths.document, 'stockfish-games.json')

/** Newest first. */
export async function playedGames(): Promise<PlayedGame[]> {
  try {
    const f = file()
    return f.exists ? JSON.parse(await f.text()) : []
  } catch {
    return []
  }
}

// one change at a time, so a review saved as a game ends can't overwrite it
let chain: Promise<unknown> = Promise.resolve()
function change<T>(
  update: (games: PlayedGame[]) => {
    games: PlayedGame[]
    result: T
  },
): Promise<T> {
  const run = chain.then(async () => {
    const { games, result } = update(await playedGames())
    try {
      file().writeSync(JSON.stringify(games.slice(0, MAX)))
    } catch {
      // a full disk only costs the history
    }
    return result
  })
  chain = run.catch(() => {})
  return run
}

/** Keeps a finished game; the same game again (a revisit) keeps its first id. */
export function recordGame(game: Omit<PlayedGame, 'id' | 'at'>) {
  return change((games) => {
    const same = games.find(
      (g) => g.pgn === game.pgn && g.colour === game.colour,
    )
    if (same) return { games, result: same.id }
    const id = `${Date.now()}`
    return { games: [{ ...game, id, at: Date.now() }, ...games], result: id }
  })
}

export async function playedGame(id: string) {
  return (await playedGames()).find((g) => g.id === id) ?? null
}

export function saveReview(id: string, scores: Score[], accuracy: number) {
  return change((games) => ({
    games: games.map((g) => (g.id === id ? { ...g, scores, accuracy } : g)),
    result: undefined,
  }))
}
