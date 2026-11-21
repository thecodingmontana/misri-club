import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMemo, useState } from 'react'
import { Spinner } from '#/components/auth'
import { ChevronRight, Cpu, Fire, Stop, Target } from '#/components/icons'
import { PlayerAvatar } from '#/components/player-chip'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import type { GameReview } from '#/lib/analysis'
import { positionsOf, reviewFor, weakPoints } from '#/lib/analysis'
import { relativeTime } from '#/lib/format'
import { GAME_COUNTS, type MyGame } from '#/lib/my-games'
import { seo } from '#/lib/seo'
import { useEngineAnalysis, useStoredScores } from '#/lib/use-engine-analysis'
import { cn } from '#/lib/utils'
import { getMyGamesFn } from '#/server/my-games.functions'

/** Your own chess.com games, checked by Stockfish in this browser. */
export const Route = createFileRoute('/_authed/analysis')({
  head: () =>
    seo({
      title: 'Analyse your games',
      description: 'Stockfish on your latest chess.com games.',
      noindex: true,
    }),
  component: AnalysisScreen,
})

function AnalysisScreen() {
  const getMyGames = useServerFn(getMyGamesFn)
  const query = useQuery({
    queryKey: ['my-games'],
    queryFn: () => getMyGames(),
    staleTime: 5 * 60_000,
  })
  const [count, setCount] = useState<number>(GAME_COUNTS[1])

  return (
    <div className="space-y-5 pt-2">
      <header className="text-center">
        <p className="kicker">Train</p>
        <h1 className="display mt-1 text-3xl">Analyse your games</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {query.data
            ? `Your latest games as ${query.data.username} on chess.com.`
            : 'Your latest games on chess.com.'}
        </p>
      </header>

      <fieldset className="flex justify-center gap-1.5">
        <legend className="sr-only">How many games to analyse</legend>
        {GAME_COUNTS.map((option) => (
          <button
            key={option}
            type="button"
            data-cuelume-select=""
            aria-pressed={count === option}
            onClick={() => setCount(option)}
            className={cn(
              'numeric rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150',
              count === option
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            {option} games
          </button>
        ))}
      </fieldset>

      {query.isPending ? (
        <Card className="items-center gap-2 p-8 text-xs text-muted-foreground">
          <Spinner />
          Fetching your games from chess.com
        </Card>
      ) : query.isError ? (
        <Card className="items-center gap-3 p-6 text-center text-xs">
          <p className="text-destructive">{query.error.message}</p>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-full"
            onClick={() => query.refetch()}
          >
            Try again
          </Button>
        </Card>
      ) : query.data.games.length === 0 ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">
          No standard chess games on chess.com in the last year.
        </Card>
      ) : (
        <Analysis games={query.data.games.slice(0, count)} />
      )}
    </div>
  )
}

function Analysis({ games }: { games: Array<MyGame> }) {
  const urls = useMemo(() => games.map((g) => g.chessComUrl), [games])
  const stored = useStoredScores(urls)
  const engine = useEngineAnalysis()

  const reviews = useMemo(() => {
    const byUrl = new Map<string, GameReview>()
    for (const game of games) {
      const scores = stored.get(game.chessComUrl)
      if (!scores) continue
      try {
        byUrl.set(
          game.chessComUrl,
          reviewFor(game.colour, positionsOf(game.pgn), scores),
        )
      } catch {
        // An unreadable PGN simply stays unanalysed.
      }
    }
    return byUrl
  }, [games, stored])

  const reviewed = [...reviews.values()]
  const pending = games.filter((g) => !stored.get(g.chessComUrl))
  const weak = weakPoints(reviewed)
  const accuracy = reviewed.length
    ? reviewed.reduce((sum, r) => sum + r.accuracy, 0) / reviewed.length
    : null
  const wins = games.filter((g) => g.outcome === 'win').length
  const draws = games.filter((g) => g.outcome === 'draw').length

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Games"
          value={games.length}
          hint={`${reviewed.length} analysed`}
        />
        <Tile
          label="Win rate"
          value={`${Math.round((wins / games.length) * 100)}%`}
          hint={`${wins}W ${draws}D ${games.length - wins - draws}L`}
        />
        <Tile
          label="Avg accuracy"
          value={accuracy === null ? '—' : `${accuracy.toFixed(1)}%`}
          hint="analysed games"
        />
        <Tile
          label="Blunders / game"
          value={
            reviewed.length ? (weak.blunders / reviewed.length).toFixed(1) : '—'
          }
          hint={
            reviewed.length ? `${weak.mistakes} mistakes` : 'run the engine'
          }
        />
      </div>

      <EngineCard
        pending={pending.length}
        total={games.length}
        engine={engine}
        onStart={() => engine.start(pending)}
      />

      {reviewed.length > 0 && (
        <WeakPoints weak={weak} games={reviewed.length} />
      )}

      <section>
        <h2 className="display mb-2 px-1 text-lg">Games</h2>
        <div className="space-y-2">
          {games.map((game) => (
            <GameRow
              key={game.chessComUrl}
              game={game}
              accuracy={reviews.get(game.chessComUrl)?.accuracy ?? null}
            />
          ))}
        </div>
      </section>
    </>
  )
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint: string
}) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3 shadow-card">
      <div className="kicker text-[0.6rem]">{label}</div>
      <div className="display numeric mt-0.5 text-2xl text-primary">
        {value}
      </div>
      <div className="text-[0.68rem] text-muted-foreground">{hint}</div>
    </div>
  )
}

function EngineCard({
  pending,
  total,
  engine,
  onStart,
}: {
  pending: number
  total: number
  engine: ReturnType<typeof useEngineAnalysis>
  onStart: () => void
}) {
  const { progress, error, stop } = engine
  const done =
    progress &&
    ((progress.game - 1) * progress.positions + progress.position) /
      (progress.games * progress.positions)

  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <Cpu className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Stockfish</p>
          <p className="text-[0.7rem] text-muted-foreground">
            {pending === 0
              ? `All ${total} games analysed`
              : `${total - pending} of ${total} games analysed`}
          </p>
        </div>
        {progress ? (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full text-destructive"
            onClick={stop}
          >
            <Stop />
            Stop
          </Button>
        ) : (
          pending > 0 && (
            <Button size="sm" className="rounded-full" onClick={onStart}>
              Analyse {pending}
            </Button>
          )
        )}
      </div>

      {progress && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.round((done ?? 0) * 100)}%` }}
            />
          </div>
          <p className="numeric mt-1.5 text-[0.7rem] text-muted-foreground">
            Game {progress.game} of {progress.games} · position{' '}
            {progress.position}/{progress.positions} · keep this tab open
          </p>
        </div>
      )}

      {error && <p className="text-[0.7rem] text-destructive">{error}</p>}

      {!progress && (
        <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
          About ten seconds a game. Stockfish runs in your browser and keeps
          results on this device, so each game is only analysed once.
        </p>
      )}
    </Card>
  )
}

function WeakPoints({
  weak,
  games,
}: {
  weak: ReturnType<typeof weakPoints>
  games: number
}) {
  const rows = [
    {
      label: 'Blunders',
      hint: 'threw away 30%+ winning chance',
      count: weak.blunders,
    },
    { label: 'Mistakes', hint: 'gave away 20–30%', count: weak.mistakes },
    {
      label: 'Inaccuracies',
      hint: 'gave away 10–20%',
      count: weak.inaccuracies,
    },
  ]

  return (
    <section>
      <h2 className="display mb-2 px-1 text-lg">Weak points</h2>
      <Card className="gap-0 py-1">
        {rows.map((row, index) => (
          <div key={row.label} className="flex items-center gap-3 px-4 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-destructive/12 text-xs font-bold text-destructive">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{row.label}</span>
              <span className="block text-[0.68rem] text-muted-foreground">
                {row.hint}
              </span>
            </span>
            <span className="numeric text-sm font-semibold">×{row.count}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
          {weak.weakestPhase ? (
            <>
              <Fire className="size-4 shrink-0 text-primary" />
              <span>
                Most fragile phase:{' '}
                <span className="font-semibold text-foreground">
                  {weak.weakestPhase.phase}
                </span>{' '}
                ({(weak.weakestPhase.rate * 100).toFixed(0)}% of moves are
                mistakes or blunders)
              </span>
            </>
          ) : (
            <>
              <Target className="size-4 shrink-0 text-primary" />
              <span>No mistakes across {games} analysed games. Clean.</span>
            </>
          )}
        </div>
      </Card>
    </section>
  )
}

function GameRow({
  game,
  accuracy,
}: {
  game: MyGame
  accuracy: number | null
}) {
  return (
    <Link
      to="/analysis/game"
      search={{ game: game.chessComUrl }}
      className="flex items-center gap-3 rounded-2xl bg-card py-2.5 pr-3 pl-3 shadow-card transition-opacity hover:opacity-80"
    >
      <span
        className={cn(
          'numeric grid size-7 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold',
          game.outcome === 'win' && 'bg-win/15 text-foreground',
          game.outcome === 'draw' && 'bg-secondary text-muted-foreground',
          game.outcome === 'loss' && 'bg-destructive/12 text-destructive',
        )}
        title={game.outcome}
      >
        {game.outcome === 'win' ? 'W' : game.outcome === 'draw' ? '½' : 'L'}
      </span>
      <PlayerAvatar username={game.opponent} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.82rem] font-semibold">
          {game.opponent}
          {game.opponentRating && (
            <span className="numeric font-normal text-muted-foreground">
              {' '}
              ({game.opponentRating})
            </span>
          )}
        </span>
        <span className="block truncate text-[0.68rem] text-muted-foreground">
          {game.label}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={cn(
            'numeric text-xs font-semibold',
            accuracy === null ? 'text-muted-foreground/60' : 'text-primary',
          )}
        >
          {accuracy === null ? '—' : `${accuracy.toFixed(1)}%`}
        </span>
        <span className="flex items-center gap-1 text-[0.62rem] text-muted-foreground">
          {relativeTime(game.endedAt)}
          <ChevronRight className="size-3" />
        </span>
      </span>
    </Link>
  )
}
