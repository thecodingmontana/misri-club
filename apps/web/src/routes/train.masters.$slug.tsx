import { createFileRoute, notFound } from '@tanstack/react-router'
import { Chess } from 'chess.js'
import { play } from 'cuelume'
import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { z } from 'zod'
import {
  ChevronLeft,
  ChevronRight,
  Cpu,
  ExternalLink,
  Pause,
  Target,
} from '#/components/icons'
import { PlayBoard } from '#/components/play-board'
import { BoardSkeleton } from '#/components/skeletons.tsx'
import { TrainHeader } from '#/components/train-header'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import type { ChartConfig } from '#/components/ui/chart'
import { ChartContainer } from '#/components/ui/chart'
import { positionsOf, reviewFor, winChance } from '#/lib/analysis'
import { confetti } from '#/lib/confetti'
import type { MasterGame } from '#/lib/masters'
import { masterGame, plyOf } from '#/lib/masters'
import { recordGuess } from '#/lib/progress'
import { seo } from '#/lib/seo'
import { useEngineAnalysis, useStoredScores } from '#/lib/use-engine-analysis'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/train/masters/$slug')({
  pendingComponent: BoardSkeleton,
  // `?ply=36` opens the game at that move, e.g. from the brilliant-moves lesson.
  validateSearch: z.object({
    ply: z.number().int().min(0).optional().catch(undefined),
  }),
  loader: ({ params }) => {
    const game = masterGame(params.slug)
    if (!game) throw notFound()
    return game
  },
  head: ({ loaderData }) =>
    loaderData
      ? seo({
          title: `${loaderData.title}: ${loaderData.white} vs ${loaderData.black}, ${loaderData.year}`,
          description: `${loaderData.description} Replay it move by move with notes, Stockfish analysis and a guess-the-move challenge.`,
          path: `/train/masters/${loaderData.slug}`,
        })
      : {},
  component: MasterGameScreen,
})

const AUTOPLAY_MS = 1200

function MasterGameScreen() {
  const game = Route.useLoaderData()
  // A fresh replay per game, so moving between games never mixes state.
  const { ply } = Route.useSearch()
  return <Replay key={game.slug} game={game} startAt={ply ?? 0} />
}

interface Guessing {
  side: 'w' | 'b'
  right: number
  tried: number
  /** What happened on the last guessed move. */
  last: { right: boolean; san: string } | null
}

function Replay({ game, startAt }: { game: MasterGame; startAt: number }) {
  const moves = useMemo(() => {
    const chess = new Chess()
    chess.loadPgn(game.moves)
    return chess.history({ verbose: true })
  }, [game])
  const notes = useMemo(
    () => new Map(game.notes.map((note) => [plyOf(note.move).ply, note])),
    [game],
  )

  const [ply, setPly] = useState(() => Math.min(startAt, moves.length))
  const [playing, setPlaying] = useState(false)
  const [guess, setGuess] = useState<Guessing | null>(null)
  const last = ply === moves.length

  const fen = ply === 0 ? moves[0].before : moves[ply - 1].after
  const lastMove = ply > 0 ? moves[ply - 1] : null
  const note = notes.get(ply)
  const go = (next: number) => {
    setPly(Math.max(0, Math.min(moves.length, next)))
    play('select', { emphasis: 'subtle' })
  }

  // Auto-play steps on until the end, then stops.
  useEffect(() => {
    if (!playing || guess) return
    if (last) {
      setPlaying(false)
      return
    }
    const timer = setTimeout(() => go(ply + 1), AUTOPLAY_MS)
    return () => clearTimeout(timer)
  })

  // Guessing: the other side's moves play themselves.
  const yourTurn = guess !== null && !last && moves[ply].color === guess.side
  useEffect(() => {
    if (!guess || last || yourTurn) return
    const timer = setTimeout(() => go(ply + 1), 700)
    return () => clearTimeout(timer)
  })

  // A finished guessing run keeps its score if it is the best so far.
  const finished = guess !== null && last
  useEffect(() => {
    if (finished && guess.tried > 0) {
      recordGuess(game.slug, guess.right, guess.tried)
      if (guess.right > 0) confetti(60)
    }
  }, [finished, guess, game.slug])

  // Arrow keys step through the game.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (guess || event.target instanceof HTMLInputElement) return
      if (event.key === 'ArrowRight') go(ply + 1)
      if (event.key === 'ArrowLeft') go(ply - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onGuess = (from: string, to: string) => {
    if (!guess || !yourTurn) return false
    const master = moves[ply]
    const right = master.from === from && master.to === to
    play(right ? 'success' : 'error', { emphasis: 'subtle' })
    // Finding a move the masters marked brilliant (!!) is worth a party.
    if (right && notes.get(ply + 1)?.brilliant) confetti()
    setGuess({
      ...guess,
      right: guess.right + (right ? 1 : 0),
      tried: guess.tried + 1,
      last: { right, san: master.san },
    })
    setPly(ply + 1)
    return right
  }

  const startGuessing = (side: 'w' | 'b') => {
    setPlaying(false)
    setPly(0)
    setGuess({ side, right: 0, tried: 0, last: null })
  }

  return (
    <div className="space-y-4 pt-2">
      <TrainHeader title={game.title} />
      <p className="-mt-2 text-xs text-muted-foreground">
        {game.white} vs {game.black} · {game.event}, {game.year} ·{' '}
        {game.opening} · {game.result}
      </p>

      <PlayBoard
        id={`master-${game.slug}`}
        fen={fen}
        orientation={guess?.side === 'b' ? 'black' : 'white'}
        interactive={yourTurn}
        onMove={onGuess}
        lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
      />

      {guess ? (
        <GuessPanel
          guess={guess}
          done={last}
          yourTurn={yourTurn}
          onStop={() => setGuess(null)}
          onRestart={() => startGuessing(guess.side)}
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous move"
              data-tip="Previous move"
              disabled={ply === 0}
              onClick={() => go(ply - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              className="flex-1"
              variant={playing ? 'secondary' : 'default'}
              onClick={() => {
                if (last) setPly(0)
                setPlaying(!playing)
              }}
            >
              {playing ? <Pause /> : null}
              {playing ? 'Pause' : last ? 'Replay' : 'Auto-play'}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next move"
              data-tip="Next move"
              disabled={last}
              onClick={() => go(ply + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <p className="numeric text-center text-xs text-muted-foreground">
            Move {ply} of {moves.length}
          </p>
        </>
      )}

      <Card className="gap-1.5 px-4 py-3" aria-live="polite">
        {note ? (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {note.move}
              {note.brilliant && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                  !! Brilliant
                </span>
              )}
            </p>
            <p className="text-sm leading-relaxed">{note.text}</p>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {ply === 0
              ? game.description
              : `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} ${moves[ply - 1].san}`}
          </p>
        )}
      </Card>

      <MoveList
        moves={moves.map((move) => move.san)}
        notes={notes}
        ply={ply}
        onPick={guess ? undefined : go}
      />

      {!guess && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => startGuessing('w')}>
            <Target /> Guess as White
          </Button>
          <Button variant="secondary" onClick={() => startGuessing('b')}>
            <Target /> Guess as Black
          </Button>
        </div>
      )}

      <EvalGraph game={game} ply={ply} onPick={guess ? undefined : setPly} />

      <a
        href={`https://lichess.org/analysis/pgn/${moves.map((m) => m.san).join('_')}`}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        Study this game on the Lichess analysis board
        <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

function GuessPanel({
  guess,
  done,
  yourTurn,
  onStop,
  onRestart,
}: {
  guess: Guessing
  done: boolean
  yourTurn: boolean
  onStop: () => void
  onRestart: () => void
}) {
  const side = guess.side === 'w' ? 'White' : 'Black'
  const message = done
    ? `Finished: you found ${guess.right} of ${guess.tried} master moves.`
    : guess.last
      ? guess.last.right
        ? `Right! The master played ${guess.last.san}.`
        : `The master played ${guess.last.san}.`
      : `You are ${side}. Find each move the master played.`

  return (
    <Card className="gap-2 px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Guess the move</span>
        <span className="numeric text-muted-foreground">
          {guess.right}/{guess.tried}
        </span>
      </div>
      <p className="text-sm" aria-live="polite">
        {message}
        {!done && yourTurn && guess.last ? ' Your move.' : ''}
      </p>
      <div className="flex gap-2">
        {done && (
          <Button size="sm" onClick={onRestart}>
            Try again
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onStop}>
          Stop guessing
        </Button>
      </div>
    </Card>
  )
}

function MoveList({
  moves,
  notes,
  ply,
  onPick,
}: {
  moves: Array<string>
  notes: Map<number, { brilliant?: boolean }>
  ply: number
  onPick?: (ply: number) => void
}) {
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-1.5 text-sm">
      {moves.map((san, index) => {
        const at = index + 1
        const note = notes.get(at)
        return (
          <li key={at} className="flex items-center">
            {index % 2 === 0 && (
              <span className="numeric mr-0.5 text-xs text-muted-foreground">
                {index / 2 + 1}.
              </span>
            )}
            <button
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.(at)}
              aria-current={at === ply ? 'step' : undefined}
              className={cn(
                'rounded-md px-1.5 py-0.5 font-medium transition-colors duration-150',
                at === ply
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-secondary',
                note &&
                  at !== ply &&
                  'underline decoration-primary decoration-2 underline-offset-4',
              )}
            >
              {san}
              {note?.brilliant ? '!!' : ''}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

const evalConfig = {
  white: { label: 'White’s chances', color: 'var(--primary)' },
} satisfies ChartConfig

/**
 * Stockfish's view of the game, worked out in this browser on request and
 * remembered there, like the player-page analysis.
 */
function EvalGraph({
  game,
  ply,
  onPick,
}: {
  game: MasterGame
  ply: number
  onPick?: (ply: number) => void
}) {
  const key = `master:${game.slug}`
  const scores = useStoredScores([key]).get(key)
  const engine = useEngineAnalysis()

  const data = useMemo(
    () =>
      scores?.map((score, index) => ({ ply: index, white: winChance(score) })),
    [scores],
  )
  const accuracy = useMemo(() => {
    if (!scores) return null
    const positions = positionsOf(game.moves)
    return {
      white: reviewFor('white', positions, scores).accuracy,
      black: reviewFor('black', positions, scores).accuracy,
    }
  }, [game, scores])

  if (!data) {
    return (
      <Card className="gap-2 px-4 py-4 text-center">
        <p className="text-sm font-semibold">Stockfish analysis</p>
        <p className="text-xs text-muted-foreground">
          See who was winning after every move. It runs in your browser and
          takes about ten seconds.
        </p>
        {engine.error && (
          <p className="text-xs text-destructive">
            {engine.error} Reload the page to try again.
          </p>
        )}
        <Button
          className="mx-auto"
          disabled={engine.progress !== null}
          onClick={() => engine.start([{ chessComUrl: key, pgn: game.moves }])}
        >
          <Cpu />
          {engine.progress
            ? `Analysing ${engine.progress.position}/${engine.progress.positions}`
            : 'Analyse with Stockfish'}
        </Button>
      </Card>
    )
  }

  return (
    <Card className="gap-2 px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">White’s winning chances</span>
        {accuracy && (
          <span className="numeric text-xs text-muted-foreground">
            Accuracy {Math.round(accuracy.white)}% ·{' '}
            {Math.round(accuracy.black)}%
          </span>
        )}
      </div>
      <ChartContainer
        config={evalConfig}
        className="aspect-auto h-32 w-full"
        role="img"
        aria-label="White's winning chances after each move"
      >
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          onClick={(state) => {
            const at = Number(state?.activeLabel)
            if (onPick && Number.isFinite(at)) onPick(at)
          }}
        >
          <XAxis dataKey="ply" hide />
          <YAxis domain={[0, 100]} hide />
          <ReferenceLine y={50} stroke="var(--border)" />
          <ReferenceLine
            x={ply}
            stroke="var(--foreground)"
            strokeDasharray="3 3"
          />
          <Area
            dataKey="white"
            type="monotone"
            stroke="var(--color-white)"
            strokeWidth={2}
            fill="var(--color-white)"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Above the middle line White is better. Tap the graph to jump to a move.
      </p>
    </Card>
  )
}
