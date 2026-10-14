import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Chess } from 'chess.js'
import { play } from 'cuelume'
import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle,
  ExternalLink,
  Lightbulb,
  RefreshCw,
  XCircle,
} from '#/components/icons'
import { PlayBoard } from '#/components/play-board'
import { TrainHeader } from '#/components/train-header'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { fetchPuzzle, fromUci, judgeMove } from '#/lib/puzzle'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/train/puzzles')({
  head: () =>
    seo({
      title: 'Chess puzzles',
      description:
        'Solve endless chess puzzles from Lichess on a touch-friendly board, with hints and full solutions.',
      path: '/train/puzzles',
    }),
  component: PuzzlesScreen,
})

/** Endless puzzles from Lichess, one at a time, solved on the board. */
function PuzzlesScreen() {
  return (
    <div className="space-y-4 pt-2">
      <TrainHeader title="Puzzles" />
      <PuzzleLoader />
    </div>
  )
}

function PuzzleLoader() {
  const [round, setRound] = useState(0)
  const [solved, setSolved] = useState(0)
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['lichess-puzzle', round],
    queryFn: fetchPuzzle,
    // Each round is one random puzzle; refetching would swap it mid-solve.
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })

  if (error) {
    return (
      <Card className="gap-3 px-4 py-8 text-center">
        <p className="text-sm font-semibold">Couldn&apos;t load a puzzle</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
        <Button className="mx-auto" onClick={() => refetch()}>
          <RefreshCw /> Try again
        </Button>
      </Card>
    )
  }

  if (isPending) {
    return <Skeleton className="aspect-square w-full rounded-xl" />
  }

  return (
    <Puzzle
      key={data.puzzle.id}
      data={data}
      solvedCount={solved}
      onSolved={() => setSolved((n) => n + 1)}
      onNext={() => setRound((n) => n + 1)}
    />
  )
}

type Status = 'solving' | 'wrong' | 'solved' | 'revealed'
type Puzzle = Awaited<ReturnType<typeof fetchPuzzle>>

function Puzzle({
  data,
  solvedCount,
  onSolved,
  onNext,
}: {
  data: Puzzle
  solvedCount: number
  onSolved: () => void
  onNext: () => void
}) {
  const { solution } = data.puzzle
  const { start } = data
  const [fen, setFen] = useState(start.fen)
  const [lastMove, setLastMove] = useState<{
    from: string
    to: string
  } | null>(start.lastMove)
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<Status>('solving')
  const [hint, setHint] = useState(false)

  // Replies and the solution play out on timers; none may outlive the puzzle.
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (run: () => void, ms: number) => {
    timers.current.push(setTimeout(run, ms))
  }

  const playersTurn = new Chess(fen).turn() === start.colour[0]
  const finished = status === 'solved' || status === 'revealed'

  const applyUci = (from: string, uci: string) => {
    const chess = new Chess(from)
    const move = chess.move(fromUci(uci))
    setFen(chess.fen())
    setLastMove({ from: move.from, to: move.to })
    return chess.fen()
  }

  const onMove = (from: string, to: string) => {
    const verdict = judgeMove(fen, solution, step, from, to)
    if (verdict.kind === 'wrong') {
      play('error', { emphasis: 'subtle' })
      setStatus('wrong')
      return false
    }

    play('tap')
    setFen(verdict.fen)
    setLastMove({ from, to })
    setHint(false)

    if (verdict.reply === null) {
      play('success')
      setStatus('solved')
      onSolved()
      return true
    }

    const reply = verdict.reply
    setStatus('solving')
    // A beat before the opponent answers, so both moves are seen.
    later(() => {
      applyUci(verdict.fen, reply)
      setStep(step + 2)
      play('select', { emphasis: 'subtle' })
    }, 450)
    return true
  }

  const reveal = () => {
    setStatus('revealed')
    setHint(false)
    let position = fen
    solution.slice(step).forEach((uci, index) => {
      later(
        () => {
          position = applyUci(position, uci)
          play('select', { emphasis: 'subtle' })
        },
        500 * (index + 1),
      )
    })
  }

  const side = start.colour === 'white' ? 'White' : 'Black'
  const message =
    hint && status === 'solving'
      ? `Hint: move the piece on ${solution[step].slice(0, 2)}.`
      : {
          solving: `${side} to move. Find the best move.`,
          wrong: 'Not that one. Try again.',
          solved: 'Solved!',
          revealed: 'Here is the solution.',
        }[status]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Rating{' '}
          <span className="numeric font-semibold text-foreground">
            {data.puzzle.rating}
          </span>
        </span>
        <span>
          Solved this visit{' '}
          <span className="numeric font-semibold text-foreground">
            {solvedCount}
          </span>
        </span>
      </div>

      <PlayBoard
        id={`puzzle-${data.puzzle.id}`}
        fen={fen}
        orientation={start.colour}
        interactive={!finished && playersTurn}
        onMove={onMove}
        lastMove={lastMove}
        hint={hint ? solution[step].slice(0, 2) : null}
      />

      <p
        className="flex min-h-6 items-center justify-center gap-1.5 text-sm font-semibold"
        aria-live="polite"
      >
        {status === 'solved' && <CheckCircle className="size-4 text-primary" />}
        {status === 'wrong' && <XCircle className="size-4 text-destructive" />}
        {message}
      </p>

      <div className="flex flex-wrap gap-2 *:flex-1 *:basis-24">
        <Button
          variant="secondary"
          disabled={finished || !playersTurn || hint}
          onClick={() => {
            setHint(true)
            setStatus('solving')
          }}
        >
          <Lightbulb /> Hint
        </Button>
        <Button
          variant="secondary"
          disabled={finished || !playersTurn}
          onClick={reveal}
        >
          Show solution
        </Button>
        <Button onClick={onNext}>Next puzzle</Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {data.puzzle.themes.slice(0, 3).map(themeName).join(' · ')}
        {' · '}
        <a
          href={`https://lichess.org/training/${data.puzzle.id}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-0.5 hover:text-primary"
        >
          Lichess puzzle <ExternalLink className="size-3" />
        </a>
      </p>
    </div>
  )
}

/** `discoveredAttack` → `discovered attack` */
const themeName = (theme: string) =>
  theme.replace(/([A-Z])/g, ' $1').toLowerCase()
