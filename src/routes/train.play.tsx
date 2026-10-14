import { createFileRoute } from '@tanstack/react-router'
import { play } from 'cuelume'
import { useEffect, useMemo, useState } from 'react'
import { Cpu } from '#/components/icons'
import { PlayBoard } from '#/components/play-board'
import { TrainHeader } from '#/components/train-header'
import { Button } from '#/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Engine } from '#/lib/engine'
import type { Colour, Outcome, SavedGame as Saved } from '#/lib/play'
import {
  PLAY_KEY as KEY,
  LEVELS,
  loadGame,
  outcomeFor,
  savedGame as saved,
  takeBack,
  withReply,
} from '#/lib/play'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/train/play')({
  head: () =>
    seo({
      title: 'Play Stockfish',
      description:
        'Play a full game of chess against Stockfish at five strengths, from Beginner to Max, and track your record.',
      path: '/train/play',
    }),
  component: PlayScreen,
})

const FRESH: Saved = { pgn: '', colour: 'white', level: 1, record: {} }

const SOUND: Record<Outcome, () => void> = {
  win: () => play('success', { emphasis: 'strong' }),
  draw: () => play('warning'),
  loss: () => play('error'),
}

/** The game with `pgn` applied, its result tallied if that move ended it. */
function commit(current: Saved, pgn: string): Saved {
  const result = outcomeFor(loadGame(pgn), current.colour)
  if (!result) return { ...current, pgn }
  const label = LEVELS[current.level].label
  const tally = current.record[label] ?? { win: 0, draw: 0, loss: 0 }
  return {
    ...current,
    pgn,
    record: {
      ...current.record,
      [label]: { ...tally, [result]: tally[result] + 1 },
    },
  }
}

/** The move's sound, or the result's if the move ended the game. */
function moveSound(pgn: string, colour: Colour, mine: boolean) {
  const result = outcomeFor(loadGame(pgn), colour)
  if (result) SOUND[result]()
  else if (mine) play('tap')
  else play('select', { emphasis: 'subtle' })
}

/** A game against Stockfish in this browser, kept across visits. */
function PlayScreen() {
  const [game, setGame] = useState<Saved>(FRESH)
  const [loaded, setLoaded] = useState(false)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = saved.safeParse(
        JSON.parse(localStorage.getItem(KEY) ?? 'null'),
      )
      if (stored.success) setGame(stored.data)
    } catch {
      // Unreadable storage: start fresh.
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(KEY, JSON.stringify(game))
    } catch {
      // Storage full or blocked: the game still plays.
    }
  }, [game, loaded])

  useEffect(() => {
    const created = new Engine()
    setEngine(created)
    return () => created.terminate()
  }, [])

  const level = LEVELS[game.level]
  useEffect(() => engine?.setSkill(level.skill), [engine, level])

  const chess = useMemo(() => loadGame(game.pgn), [game.pgn])
  const outcome = outcomeFor(chess, game.colour)
  const yourTurn = chess.turn() === game.colour[0]
  const last = chess.history({ verbose: true }).at(-1)
  const thinking = loaded && !outcome && !yourTurn && !error

  // Stockfish replies whenever it is its turn, including on a resumed game.
  useEffect(() => {
    if (!engine || !loaded || outcome || yourTurn) return
    const fen = chess.fen()
    let live = true
    engine
      .evaluate(fen, level.ms)
      .then(({ best }) => {
        if (!live || !best) return
        const next = withReply(chess.pgn(), fen, best)
        if (!next) return
        moveSound(next, game.colour, false)
        setGame((current) => {
          const pgn = withReply(current.pgn, fen, best)
          return pgn ? commit(current, pgn) : current
        })
      })
      .catch((failure: Error) => live && setError(failure.message))
    return () => {
      live = false
    }
  }, [engine, loaded, chess, outcome, yourTurn, level, game.colour])

  const onMove = (from: string, to: string) => {
    const next = loadGame(game.pgn)
    try {
      // shortcut: always promotes to a queen; add a picker if underpromotion matters.
      next.move({ from, to, promotion: 'q' })
    } catch {
      return false
    }
    moveSound(next.pgn(), game.colour, true)
    setGame(commit(game, next.pgn()))
    return true
  }

  const newGame = (colour: Colour) => setGame({ ...game, pgn: '', colour })

  const tally = game.record[level.label]
  const status = outcome
    ? {
        win: 'Checkmate. You win!',
        loss: 'Checkmate. Stockfish wins.',
        draw: 'Draw.',
      }[outcome]
    : thinking
      ? 'Stockfish is thinking…'
      : yourTurn
        ? chess.inCheck()
          ? 'Your move. You are in check.'
          : 'Your move.'
        : ''

  return (
    <div className="space-y-3 pt-2">
      <TrainHeader title="Play Stockfish" />
      <div className="flex items-center justify-between gap-3">
        <span id="strength-label" className="text-sm font-medium">
          Stockfish strength
        </span>
        <Select
          value={String(game.level)}
          onValueChange={(value) => setGame({ ...game, level: Number(value) })}
        >
          <SelectTrigger aria-labelledby="strength-label" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((option, index) => (
              <SelectItem key={option.label} value={String(index)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PlayBoard
        id="play-stockfish"
        fen={chess.fen()}
        orientation={game.colour}
        interactive={loaded && !outcome && yourTurn}
        onMove={onMove}
        lastMove={last ? { from: last.from, to: last.to } : null}
      />

      <p
        className="flex min-h-6 items-center justify-center gap-1.5 text-sm font-semibold"
        aria-live="polite"
      >
        {thinking && <Cpu className="size-4 animate-pulse text-primary" />}
        {error ? `${error} Reload the page to try again.` : status}
      </p>

      <div className="flex flex-wrap gap-2 *:flex-1 *:basis-24">
        <Button
          variant="secondary"
          disabled={chess.history().length === 0}
          onClick={() =>
            setGame({ ...game, pgn: takeBack(game.pgn, game.colour) })
          }
        >
          Take back
        </Button>
        <Button variant="secondary" onClick={() => newGame('white')}>
          Play White
        </Button>
        <Button variant="secondary" onClick={() => newGame('black')}>
          Play Black
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Your record vs {level.label}:{' '}
        <span className="numeric font-semibold text-foreground">
          {tally?.win ?? 0}W · {tally?.draw ?? 0}D · {tally?.loss ?? 0}L
        </span>
      </p>
    </div>
  )
}
