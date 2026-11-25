import { useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import type { Move } from 'chess.js'
import { Chess } from 'chess.js'
import { play } from 'cuelume'
import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lightbulb,
} from '#/components/icons'
import { PlayBoard } from '#/components/play-board'
import { BoardSkeleton } from '#/components/skeletons.tsx'
import { TrainHeader } from '#/components/train-header'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { confetti } from '#/lib/confetti'
import type { OpeningCourse } from '#/lib/openings'
import { lichessOpeningUrl, opening } from '#/lib/openings'
import { recordDrill } from '#/lib/progress'
import { seo } from '#/lib/seo'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/train/openings/$slug')({
  pendingComponent: BoardSkeleton,
  loader: ({ params }) => {
    const course = opening(params.slug)
    if (!course) throw notFound()
    return course
  },
  head: ({ loaderData }) =>
    loaderData
      ? seo({
          title: `${loaderData.name} (${loaderData.eco})`,
          description: `${loaderData.summary} Every move of the ${loaderData.name} explained, then drilled from memory.`,
          path: `/train/openings/${loaderData.slug}`,
        })
      : {},
  component: CourseScreen,
})

function CourseScreen() {
  const course = Route.useLoaderData()
  return <Course key={course.slug} course={course} />
}

type Mode = 'learn' | 'drill'

function Course({ course }: { course: OpeningCourse }) {
  const moves = useMemo(() => {
    const chess = new Chess()
    chess.loadPgn(course.moves)
    return chess.history({ verbose: true })
  }, [course])
  const [mode, setMode] = useState<Mode>('learn')
  const [title, variation] = course.name.split(': ')

  return (
    <div className="space-y-4 pt-2">
      <TrainHeader title={title} />
      <p className="-mt-2 text-xs text-muted-foreground">
        {variation ? `${variation} · ` : ''}
        {course.eco} · you play {course.side === 'white' ? 'White' : 'Black'}
      </p>

      <fieldset className="flex gap-1 rounded-full bg-secondary p-1">
        <legend className="sr-only">Mode</legend>
        {(['learn', 'drill'] as const).map((option) => (
          <button
            key={option}
            type="button"
            data-cuelume-select=""
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
            className={cn(
              'flex-1 rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors duration-150',
              mode === option
                ? 'bg-background text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option === 'learn' ? 'Learn the line' : 'Drill it'}
          </button>
        ))}
      </fieldset>

      {mode === 'learn' ? (
        <Learn course={course} moves={moves} onDrill={() => setMode('drill')} />
      ) : (
        <Drill course={course} moves={moves} />
      )}

      <a
        href={lichessOpeningUrl(course.name)}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        Statistics and master games on Lichess
        <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

type Moves = Array<Move>

function Learn({
  course,
  moves,
  onDrill,
}: {
  course: OpeningCourse
  moves: Moves
  onDrill: () => void
}) {
  const [ply, setPly] = useState(0)
  const done = ply === moves.length
  const fen = ply === 0 ? moves[0].before : moves[ply - 1].after
  const last = ply > 0 ? moves[ply - 1] : null
  const go = (next: number) => {
    setPly(Math.max(0, Math.min(moves.length, next)))
    play('select', { emphasis: 'subtle' })
  }

  return (
    <>
      <PlayBoard
        id={`opening-${course.slug}`}
        fen={fen}
        orientation={course.side}
        interactive={false}
        onMove={() => false}
        lastMove={last ? { from: last.from, to: last.to } : null}
      />
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
        <p className="numeric flex-1 text-center text-xs text-muted-foreground">
          Move {ply} of {moves.length}
          <CloudEval fen={fen} />
        </p>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Next move"
          data-tip="Next move"
          disabled={done}
          onClick={() => go(ply + 1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <Card className="gap-1.5 px-4 py-3" aria-live="polite">
        {last ? (
          <>
            <p className="text-sm font-semibold">
              {Math.ceil(ply / 2)}
              {ply % 2 ? '.' : '...'} {last.san}
            </p>
            <p className="text-sm leading-relaxed">{course.why[ply - 1]}</p>
          </>
        ) : (
          <p className="text-sm leading-relaxed">{course.summary}</p>
        )}
      </Card>

      {done && (
        <Card className="gap-2 px-4 py-3">
          <p className="text-sm font-semibold">Plans from here</p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {course.plans.map((plan) => (
              <li key={plan}>{plan}</li>
            ))}
          </ul>
          <Button className="mt-1" onClick={onDrill}>
            Drill this line
          </Button>
        </Card>
      )}
    </>
  )
}

/**
 * Lichess's cloud evaluation of the position, when it has one; well-known
 * opening positions almost always do. Shown from White's side, as on Lichess.
 */
function CloudEval({ fen }: { fen: string }) {
  const { data } = useQuery({
    queryKey: ['cloud-eval', fen],
    queryFn: async () => {
      const response = await fetch(
        `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`,
      )
      if (!response.ok) return null
      const body = (await response.json()) as {
        pvs?: Array<{ cp?: number; mate?: number }>
      }
      return body.pvs?.[0] ?? null
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  if (!data) return null
  const value =
    data.mate !== undefined
      ? `#${data.mate}`
      : `${(data.cp ?? 0) >= 0 ? '+' : ''}${((data.cp ?? 0) / 100).toFixed(1)}`
  return (
    <span
      className="ml-2"
      data-tip="Lichess cloud evaluation, from White’s side"
    >
      · Eval {value}
    </span>
  )
}

function Drill({ course, moves }: { course: OpeningCourse; moves: Moves }) {
  const [ply, setPly] = useState(0)
  const [slipped, setSlipped] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [shown, setShown] = useState(false)
  const done = ply === moves.length
  const fen = ply === 0 ? moves[0].before : moves[ply - 1].after
  const last = ply > 0 ? moves[ply - 1] : null
  const yourTurn = !done && moves[ply].color === course.side[0]

  // The book replies for the other side play themselves.
  useEffect(() => {
    if (done || yourTurn) return
    const timer = setTimeout(() => {
      setPly(ply + 1)
      play('select', { emphasis: 'subtle' })
    }, 500)
    return () => clearTimeout(timer)
  }, [done, yourTurn, ply])

  // Count the run once, when the line is finished.
  useEffect(() => {
    if (!done) return
    play('success')
    confetti()
    recordDrill(course.slug, !slipped)
  }, [done, course.slug, slipped])

  const onMove = (from: string, to: string) => {
    const book = moves[ply]
    if (book.from !== from || book.to !== to) {
      play('error', { emphasis: 'subtle' })
      setSlipped(true)
      setWrong(true)
      return false
    }
    play('tap')
    setWrong(false)
    setShown(false)
    setPly(ply + 1)
    return true
  }

  const restart = () => {
    setPly(0)
    setSlipped(false)
    setWrong(false)
    setShown(false)
  }

  const message = done
    ? slipped
      ? 'Line complete. Run it again without a slip to make it stick.'
      : 'Perfect run! You played every move from memory.'
    : wrong
      ? 'That is not the book move. Try again.'
      : yourTurn
        ? `Your move as ${course.side === 'white' ? 'White' : 'Black'}.`
        : 'The book reply…'

  return (
    <>
      <PlayBoard
        id={`drill-${course.slug}`}
        fen={fen}
        orientation={course.side}
        interactive={yourTurn}
        onMove={onMove}
        lastMove={last ? { from: last.from, to: last.to } : null}
        hint={shown && yourTurn ? moves[ply].from : null}
      />
      <p
        className="flex min-h-6 items-center justify-center gap-1.5 text-sm font-semibold"
        aria-live="polite"
      >
        {done && !slipped && <CheckCircle className="size-4 text-primary" />}
        {shown && yourTurn ? `Move the piece on ${moves[ply].from}.` : message}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={!yourTurn || shown}
          onClick={() => {
            setShown(true)
            setSlipped(true)
          }}
        >
          <Lightbulb /> Show me
        </Button>
        <Button variant="secondary" className="flex-1" onClick={restart}>
          Start over
        </Button>
      </div>
    </>
  )
}
