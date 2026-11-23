import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSavedAnalysesFn, saveAnalysisFn } from '#/server/analysis.functions'
import { positionsOf } from './analysis'
import type { Score } from './engine'
import { Engine } from './engine'

/**
 * Engine scores: TanStack Query holds them in memory for the page,
 * localStorage keeps them across visits, and a signed-in player's account
 * keeps them for their other devices. A game is analysed once, not once per
 * browser. A finished game never changes, so nothing goes stale.
 */

/** Per position. ~80 positions a game makes this about 10 s per game. */
const MOVETIME_MS = 120

// v2 added Stockfish's best move per position; v1 entries are simply ignored.
const storageKey = (url: string) => `misri:scores:v2:${url}`
const queryKey = (url: string) => ['engine-scores', url] as const

function readStored(url: string): Array<Score> | null {
  try {
    const raw = localStorage.getItem(storageKey(url))
    return raw ? (JSON.parse(raw) as Array<Score>) : null
  } catch {
    return null
  }
}

function writeStored(url: string, scores: Array<Score>) {
  try {
    localStorage.setItem(storageKey(url), JSON.stringify(scores))
  } catch {
    // Storage full or blocked: the scores still live in the query cache.
  }
}

/** Cached scores for each game, `undefined` where it has not been analysed. */
export function useStoredScores(urls: Array<string>) {
  // a stable combine keeps the Map the same object between renders, so pages
  // memoising on it don't re-parse every game on each progress tick
  const combine = useCallback(
    (results: Array<{ data?: Array<Score> | null }>) =>
      new Map(urls.map((url, i) => [url, results[i].data ?? undefined])),
    [urls],
  )
  const queryClient = useQueryClient()
  const local = useQueries({
    queries: urls.map((url) => ({
      queryKey: queryKey(url),
      // localStorage only exists in the browser; the server renders "not yet".
      queryFn: () => readStored(url),
      enabled: typeof window !== 'undefined',
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
    })),
    combine,
  })
  // what this browser hasn't got: one look in the account (signed in only;
  // signed out, the call fails and the games are simply not analysed yet)
  // null = this browser looked and has none; undefined = still looking
  const missing = urls.filter(
    (url) => queryClient.getQueryData(queryKey(url)) === null,
  )
  useQuery({
    queryKey: ['saved-analyses', missing],
    enabled: typeof window !== 'undefined' && missing.length > 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const saved = await getSavedAnalysesFn({
        data: { urls: missing.slice(0, 50) },
      })
      for (const [url, scores] of Object.entries(saved)) {
        writeStored(url, scores)
        queryClient.setQueryData(queryKey(url), scores)
      }
      return Object.keys(saved).length
    },
  })
  return local
}

export interface AnalysisProgress {
  game: number
  games: number
  position: number
  positions: number
}

export function useEngineAnalysis() {
  const queryClient = useQueryClient()
  const engine = useRef<Engine | null>(null)
  const [progress, setProgress] = useState<AnalysisProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    engine.current?.terminate()
    engine.current = null
    setProgress(null)
  }, [])

  // Leaving the page must not leave a worker running in the background.
  useEffect(() => stop, [stop])

  const start = useCallback(
    async (games: Array<{ chessComUrl: string; pgn: string }>) => {
      stop()
      setError(null)
      const current = new Engine()
      engine.current = current
      let skipped = 0

      try {
        for (const [index, game] of games.entries()) {
          let fens: Array<string>
          try {
            fens = positionsOf(game.pgn).fens
          } catch {
            skipped++ // A PGN chess.js cannot read; the rest still count.
            continue
          }
          const scores: Array<Score> = []

          for (const fen of fens) {
            if (engine.current !== current) return
            setProgress({
              game: index + 1,
              games: games.length,
              position: scores.length + 1,
              positions: fens.length,
            })
            scores.push(await current.evaluate(fen, MOVETIME_MS))
          }

          if (engine.current !== current) return
          writeStored(game.chessComUrl, scores)
          queryClient.setQueryData(queryKey(game.chessComUrl), scores)
          // for the player's other devices; signed out or offline, this browser still has it
          saveAnalysisFn({ data: { url: game.chessComUrl, scores } }).catch(
            () => {},
          )
        }
        if (skipped > 0) {
          setError(
            `${skipped} game${skipped === 1 ? '' : 's'} could not be read.`,
          )
        }
      } catch (failure) {
        if (engine.current === current) setError((failure as Error).message)
      } finally {
        if (engine.current === current) stop()
      }
    },
    [queryClient, stop],
  )

  return { progress, error, start, stop }
}
