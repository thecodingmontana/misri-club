import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { play } from 'cuelume'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import type { BoardStep } from '#/components/chess-board'
import { ChessBoard } from '#/components/chess-board'
import {
  CheckCircle,
  ChevronLeft,
  Cpu,
  ExternalLink,
  Lightbulb,
  XCircle,
} from '#/components/icons'
import { SpeakButton } from '#/components/speak-button'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import type { LessonMoment, QuizQuestion } from '#/lib/lesson'
import { buildLesson } from '#/lib/lesson'
import { playerGamesQuery } from '#/lib/queries'
import { useEngineAnalysis, useStoredScores } from '#/lib/use-engine-analysis'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/players/$username_/lesson')({
  validateSearch: z.object({ game: z.string().url() }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(playerGamesQuery(params.username)),
  component: LessonScreen,
})

/**
 * A lesson from one game, built in the browser from Stockfish's analysis and
 * a few chess rules — no AI and no server work beyond the game itself.
 */
function LessonScreen() {
  const { username } = Route.useParams()
  const { game: url } = Route.useSearch()
  const { data } = useSuspenseQuery(playerGamesQuery(username))
  const game = data.recent.find((g) => g.chessComUrl === url)
  const scores = useStoredScores(game ? [game.chessComUrl] : []).get(url)
  const engine = useEngineAnalysis()

  const lesson = useMemo(
    () =>
      game && scores
        ? buildLesson({
            pgn: game.pgn,
            colour: game.colour,
            scores,
            opponent: game.opponent,
            outcome: game.outcome,
          })
        : null,
    [game, scores],
  )

  return (
    <div className="space-y-6 pt-2">
      <Link
        to="/players/$username"
        params={{ username }}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        <ChevronLeft className="size-4" />
        {username}
      </Link>

      {!game ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">
          This game isn&apos;t among {username}&apos;s recent games.
        </Card>
      ) : !lesson ? (
        <Card className="gap-3 px-4 py-6 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Cpu className="size-6" />
          </span>
          <h1 className="display text-xl">Analyse this game first</h1>
          <p className="mx-auto max-w-xs text-xs text-muted-foreground">
            The lesson is built from Stockfish&apos;s verdict on every move vs{' '}
            {game.opponent}. It runs in your browser and takes about ten
            seconds.
          </p>
          {engine.progress ? (
            <p className="numeric text-xs text-muted-foreground">
              Position {engine.progress.position}/{engine.progress.positions}…
            </p>
          ) : (
            <Button
              className="mx-auto rounded-full"
              onClick={() => engine.start([game])}
            >
              Analyse and build the lesson
            </Button>
          )}
          {engine.error && (
            <p className="text-xs text-destructive">{engine.error}</p>
          )}
        </Card>
      ) : (
        <article className="space-y-6">
          <header>
            <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-primary">
              Stockfish coach
            </span>
            <h1 className="display mt-2 text-[1.7rem] leading-tight">
              {lesson.title}
            </h1>
          </header>

          <div className="flex items-start gap-3 rounded-2xl border-l-4 border-primary bg-card px-4 py-3 shadow-card">
            <p className="flex-1 text-sm leading-relaxed">
              <span className="font-bold text-primary">The mental model: </span>
              {lesson.mentalModel}
            </p>
            <SpeakButton text={`The mental model. ${lesson.mentalModel}`} />
          </div>

          <p className="text-[0.8rem] italic leading-relaxed text-muted-foreground">
            {lesson.summary}
          </p>

          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h2 className="display text-lg">{lesson.principle.heading}</h2>
              <SpeakButton
                text={`${lesson.principle.heading}. ${lesson.principle.body}`}
              />
            </div>
            <p className="text-sm leading-relaxed">{lesson.principle.body}</p>
          </section>

          {lesson.moments.map((moment) => (
            <section key={moment.ply} className="space-y-3">
              <h2 className="display text-lg">{moment.heading}</h2>
              <div className="flex items-start gap-3 rounded-2xl bg-card px-4 py-3 shadow-card">
                <p className="flex-1 text-[0.8rem] leading-relaxed">
                  <Lightbulb className="mr-1 inline size-4 text-primary" />
                  <span className="font-bold text-primary">Theory: </span>
                  {moment.theory}
                </p>
                <SpeakButton text={moment.theory} />
              </div>
              <p className="text-xs text-muted-foreground">{moment.prompt}</p>
              <ChessBoard
                id={`moment-${moment.ply}`}
                orientation={game.colour}
                steps={stepsFor(moment)}
              />
              <a
                href={game.chessComUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground underline underline-offset-2 hover:text-primary"
              >
                From your game, move {moment.moveNumber}
                <ExternalLink className="size-3" />
              </a>
            </section>
          ))}

          {lesson.quiz.length > 0 && (
            <section className="space-y-3">
              <h2 className="display text-lg">Check your understanding</h2>
              {lesson.quiz.map((question) => (
                <Quiz key={question.question} question={question} />
              ))}
            </section>
          )}

          <Completed url={game.chessComUrl} />
        </article>
      )}
    </div>
  )
}

/** The moment as a sequence: the position, your move, the better one, the punishment. */
function stepsFor(moment: LessonMoment): Array<BoardStep> {
  const steps: Array<BoardStep> = [
    {
      label: 'Position',
      fen: moment.fen,
      caption: moment.hanging.length
        ? 'Red rings mark pieces that are attacked and have no defender.'
        : 'Your move. What would you play?',
      hanging: moment.hanging,
    },
    {
      label: 'You played',
      fen: moment.played.after,
      caption: `You played ${moment.played.san}.`,
      arrow: { from: moment.played.from, to: moment.played.to, tone: 'played' },
    },
  ]
  if (moment.reply) {
    steps.push({
      label: 'Their reply',
      fen: moment.reply.after,
      caption: `Their best answer is ${moment.reply.san}.`,
      arrow: { from: moment.reply.from, to: moment.reply.to, tone: 'reply' },
    })
  }
  if (moment.best) {
    steps.push({
      label: 'Best',
      fen: moment.best.after,
      caption: `Stockfish preferred ${moment.best.san}.`,
      arrow: { from: moment.best.from, to: moment.best.to, tone: 'best' },
    })
  }
  return steps
}

function Quiz({ question }: { question: QuizQuestion }) {
  const [picked, setPicked] = useState<number | null>(null)

  return (
    <Card className="gap-2 px-4 py-4">
      <p className="text-sm font-semibold">{question.question}</p>
      {question.options.map((option, index) => {
        const answered = picked !== null
        const correct = index === question.answer
        return (
          <button
            key={option}
            type="button"
            disabled={answered}
            onClick={() => {
              setPicked(index)
              play(correct ? 'success' : 'error')
            }}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[0.8rem] transition-colors',
              !answered &&
                'border-border hover:border-primary/50 hover:bg-secondary',
              answered &&
                correct &&
                'border-primary bg-primary/12 font-semibold',
              answered &&
                !correct &&
                index === picked &&
                'border-destructive bg-destructive/10',
              answered &&
                !correct &&
                index !== picked &&
                'border-border opacity-60',
            )}
          >
            <span className="flex-1">{option}</span>
            {answered && correct && (
              <CheckCircle className="size-4 text-primary" />
            )}
            {answered && !correct && index === picked && (
              <XCircle className="size-4 text-destructive" />
            )}
          </button>
        )
      })}
      {picked !== null && (
        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
          {question.explanation}
        </p>
      )}
    </Card>
  )
}

/** Per-browser checkmark; there are no player accounts to store it against. */
function Completed({ url }: { url: string }) {
  const key = `misri:lesson-done:${url}`
  const [done, setDone] = useState(false)

  useEffect(() => {
    try {
      setDone(localStorage.getItem(key) === '1')
    } catch {
      // Storage blocked: the button still works for this visit.
    }
  }, [key])

  const toggle = () => {
    const next = !done
    setDone(next)
    try {
      if (next) localStorage.setItem(key, '1')
      else localStorage.removeItem(key)
    } catch {
      // Same as above.
    }
  }

  return (
    <Button
      variant={done ? 'secondary' : 'default'}
      className="rounded-full"
      onClick={toggle}
    >
      {done && <CheckCircle />}
      {done ? 'Completed' : 'Mark as completed'}
    </Button>
  )
}
