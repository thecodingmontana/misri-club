import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Chess } from 'chess.js'
import { play } from 'cuelume'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { confetti } from '#/lib/confetti'
import { mistakePuzzles } from '#/lib/lesson'
import { recordPuzzle } from '#/lib/progress'
import type { Difficulty, Theme } from '#/lib/puzzle'
import {
  DIFFICULTIES,
  fetchPuzzle,
  fromUci,
  judgeMove,
  THEME_GROUPS,
  THEMES,
} from '#/lib/puzzle'
import { seo } from '#/lib/seo'
import { useAdmin } from '#/lib/use-admin'
import { useStoredScores } from '#/lib/use-engine-analysis'
import { cn } from '#/lib/utils'
import { getMyGamesFn } from '#/server/my-games.functions'

export const Route = createFileRoute('/train/puzzles')({
  // Unknown values fall back to any theme and normal difficulty.
  validateSearch: z.object({
    theme: z
      .enum(Object.keys(THEMES) as [Theme, ...Array<Theme>])
      .optional()
      .catch(undefined),
    difficulty: z.enum(DIFFICULTIES).optional().catch(undefined),
    /** puzzles from your own analysed games instead of Lichess */
    source: z.enum(['mine']).optional().catch(undefined),
  }),
  head: ({ match }) => {
    const theme = match.search.theme
    return seo({
      title: theme ? `Chess puzzles: ${THEMES[theme]}` : 'Chess puzzles',
      description: theme
        ? `Practise ${THEMES[theme].toLowerCase()} with endless Lichess puzzles on a touch-friendly board, with hints and full solutions.`
        : 'Solve endless chess puzzles from Lichess by theme and difficulty, on a touch-friendly board with hints and full solutions.',
      path: theme ? `/train/puzzles?theme=${theme}` : '/train/puzzles',
    })
  },
  component: PuzzlesScreen,
})

/** Endless puzzles from Lichess, one at a time, solved on the board. */
function PuzzlesScreen() {
  const { source } = Route.useSearch()
  return (
    <div className="space-y-4 pt-2">
      <TrainHeader title="Puzzles" />
      <SourcePicker />
      {source === 'mine' ? (
        <MyPuzzles />
      ) : (
        <>
          <Pickers />
          <PuzzleLoader />
        </>
      )}
    </div>
  )
}

function SourcePicker() {
  const { source } = Route.useSearch()
  const options = [
    { value: undefined, label: 'Lichess puzzles' },
    { value: 'mine' as const, label: 'Your mistakes' },
  ]
  return (
    <nav aria-label="Puzzle source" className="flex justify-center gap-2">
      {options.map((option) => (
        <Link
          key={option.label}
          to="/train/puzzles"
          search={(prev) => ({ ...prev, source: option.value })}
          replace
          aria-current={source === option.value ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150',
            source === option.value
              ? 'border-primary bg-primary/12 text-primary'
              : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  )
}

/**
 * Every blunder and mistake from your analysed games, one at a time: find the
 * move Stockfish would have played. Engine results live in this browser.
 */
function MyPuzzles() {
  const { user } = useAdmin()
  if (!user) {
    return (
      <Card className="gap-3 px-4 py-8 text-center text-sm">
        <p>
          Sign in to practise the positions you got wrong in your own games.
        </p>
        <Button asChild className="mx-auto">
          <Link
            to="/auth/signin"
            search={{ redirect: '/train/puzzles?source=mine' }}
          >
            Sign in
          </Link>
        </Button>
      </Card>
    )
  }
  return <MyPuzzleRun />
}

function MyPuzzleRun() {
  const getMyGames = useServerFn(getMyGamesFn)
  const query = useQuery({
    queryKey: ['my-games'],
    queryFn: () => getMyGames(),
    staleTime: 5 * 60_000,
  })
  const games = useMemo(() => query.data?.games ?? [], [query.data])
  const urls = useMemo(() => games.map((g) => g.chessComUrl), [games])
  const stored = useStoredScores(urls)
  const puzzles = useMemo(
    () =>
      games.flatMap((game) => {
        const scores = stored.get(game.chessComUrl)
        if (!scores) return []
        try {
          return mistakePuzzles(game, scores)
        } catch {
          return [] // an unreadable game simply gives no puzzles
        }
      }),
    [games, stored],
  )
  const [index, setIndex] = useState(0)
  const [solved, setSolved] = useState(0)

  if (query.isPending) {
    return <Skeleton className="aspect-square w-full rounded-xl" />
  }
  if (query.isError) {
    return (
      <Card className="px-4 py-8 text-center text-sm text-destructive">
        {query.error.message}
      </Card>
    )
  }
  if (puzzles.length === 0) {
    return (
      <Card className="gap-3 px-4 py-8 text-center">
        <p className="text-sm font-semibold">No mistakes to practise yet</p>
        <p className="text-xs text-muted-foreground">
          Run Stockfish on your games first. Every blunder and mistake it finds
          becomes a puzzle here.
        </p>
        <Button asChild className="mx-auto">
          <Link to="/analysis">Analyse your games</Link>
        </Button>
      </Card>
    )
  }

  const at = index % puzzles.length
  const puzzle = puzzles[at]
  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-muted-foreground">
        Position {at + 1} of {puzzles.length}
      </p>
      <Puzzle
        key={puzzle.id}
        data={{
          puzzle: { id: `mine-${at}`, solution: [puzzle.solution], themes: [] },
          start: {
            fen: puzzle.fen,
            colour: puzzle.colour,
            lastMove: puzzle.lastMove,
          },
        }}
        solvedCount={solved}
        onSolved={() => setSolved((n) => n + 1)}
        onNext={() => setIndex((n) => n + 1)}
        footer={
          <a
            href={puzzle.gameUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-0.5 hover:text-primary"
          >
            Your game vs {puzzle.opponent}, move {puzzle.moveNumber}{' '}
            <ExternalLink className="size-3" />
          </a>
        }
      />
    </div>
  )
}

/** Theme and difficulty live in the address, so a lesson can link to forks. */
function Pickers() {
  const { theme, difficulty } = Route.useSearch()
  const navigate = Route.useNavigate()
  const set = (next: { theme?: Theme; difficulty?: Difficulty }) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })

  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <Select
        value={theme ?? 'any'}
        onValueChange={(value) =>
          set({ theme: value === 'any' ? undefined : (value as Theme) })
        }
      >
        <SelectTrigger aria-label="Puzzle theme" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any theme</SelectItem>
          {THEME_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.themes.map((key) => (
                <SelectItem key={key} value={key}>
                  {THEMES[key]}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={difficulty ?? 'normal'}
        onValueChange={(value) => set({ difficulty: value as Difficulty })}
      >
        <SelectTrigger
          aria-label="Puzzle difficulty"
          className="w-32 capitalize"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DIFFICULTIES.map((level) => (
            <SelectItem key={level} value={level} className="capitalize">
              {level}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function PuzzleLoader() {
  const { theme, difficulty } = Route.useSearch()
  const [round, setRound] = useState(0)
  const [solved, setSolved] = useState(0)
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['lichess-puzzle', theme, difficulty, round],
    queryFn: () => fetchPuzzle({ theme, difficulty }),
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
      footer={
        <>
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
        </>
      }
    />
  )
}

type Status = 'solving' | 'wrong' | 'solved' | 'revealed'
/** What the board needs: Lichess puzzles and your own mistakes alike. */
type PuzzleData = {
  puzzle: { id: string; rating?: number; solution: string[]; themes: string[] }
  start: {
    fen: string
    colour: 'white' | 'black'
    lastMove: { from: string; to: string } | null
  }
}

function Puzzle({
  data,
  solvedCount,
  onSolved,
  onNext,
  footer,
}: {
  data: PuzzleData
  solvedCount: number
  onSolved: () => void
  onNext: () => void
  footer: ReactNode
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
  // Any slip, hint or reveal means the puzzle no longer counts as clean.
  const [helped, setHelped] = useState(false)

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
      setHelped(true)
      return false
    }

    play('tap')
    setFen(verdict.fen)
    setLastMove({ from, to })
    setHint(false)

    if (verdict.reply === null) {
      play('success')
      confetti()
      setStatus('solved')
      onSolved()
      recordPuzzle(data.puzzle.themes, !helped)
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
    recordPuzzle(data.puzzle.themes, false)
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
          {data.puzzle.rating !== undefined && (
            <>
              Rating{' '}
              <span className="numeric font-semibold text-foreground">
                {data.puzzle.rating}
              </span>
            </>
          )}
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
            setHelped(true)
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

      <p className="text-center text-xs text-muted-foreground">{footer}</p>
    </div>
  )
}

/** `discoveredAttack` → `discovered attack` */
const themeName = (theme: string) =>
  theme.replace(/([A-Z])/g, ' $1').toLowerCase()
