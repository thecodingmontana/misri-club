import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Book, Cpu, ExternalLink, Fire, Stop, Target } from '#/components/icons'
import { PlayerAvatar } from '#/components/player-chip'
import { RatingChart } from '#/components/rating-chart'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import type { GameReview } from '#/lib/analysis'
import { positionsOf, reviewFor, weakPoints } from '#/lib/analysis'
import { relativeTime } from '#/lib/format'
import { useEngineAnalysis, useStoredScores } from '#/lib/use-engine-analysis'
import { cn } from '#/lib/utils'
import type { PlayerGamesData } from '#/server/queries.server'

/** Games per click: about a minute and a half of engine time. */
const BATCH = 8

/**
 * Everything the player page knows from the member's own chess.com games:
 * results, rating over time, and Stockfish's verdict on the recent ones —
 * computed in this browser and remembered here.
 */
export function PlayerAnalysis({
  username,
  data,
}: {
  username: string
  data: PlayerGamesData
}) {
  const urls = useMemo(() => data.recent.map((g) => g.chessComUrl), [data])
  const stored = useStoredScores(urls)
  const engine = useEngineAnalysis()

  const reviews = useMemo(() => {
    const byUrl = new Map<string, GameReview>()
    for (const game of data.recent) {
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
  }, [data, stored])

  const reviewed = [...reviews.values()]
  const pending = data.recent.filter((g) => !stored.get(g.chessComUrl))
  const weak = weakPoints(reviewed)
  const accuracy = reviewed.length
    ? reviewed.reduce((sum, r) => sum + r.accuracy, 0) / reviewed.length
    : null
  const { tally } = data

  if (tally.games === 0) {
    return (
      <Card className="p-8 text-center text-xs text-muted-foreground">
        No chess.com games stored yet. They arrive with the next sync.
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Games"
          value={tally.games}
          hint={`${reviewed.length} analysed`}
        />
        <Tile
          label="Win rate"
          value={`${Math.round((tally.wins / tally.games) * 100)}%`}
          hint={`${tally.wins}W ${tally.draws}D ${tally.losses}L`}
        />
        <Tile
          label="Avg accuracy"
          value={accuracy === null ? '—' : `${accuracy.toFixed(1)}%`}
          hint="recent games"
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
        total={data.recent.length}
        engine={engine}
        onStart={() => engine.start(pending.slice(0, BATCH))}
      />

      <RatingSection ratings={data.ratings} />

      {reviewed.length > 0 && (
        <WeakPoints weak={weak} games={reviewed.length} />
      )}

      <section>
        <h2 className="display mb-2 px-1 text-lg">Recent games</h2>
        <div className="space-y-2">
          {data.recent.map((game) => (
            <GameRow
              key={game.chessComUrl}
              username={username}
              game={game}
              accuracy={reviews.get(game.chessComUrl)?.accuracy ?? null}
            />
          ))}
        </div>
      </section>
    </div>
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
          <p className="text-sm font-semibold">Engine analysis</p>
          <p className="text-[0.7rem] text-muted-foreground">
            {pending === 0
              ? `All ${total} recent games analysed`
              : `${total - pending} of ${total} recent games analysed`}
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
              Analyse {Math.min(pending, BATCH)}
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
          Stockfish runs in your browser and results are kept on this device, so
          each game is only analysed once.
        </p>
      )}
    </Card>
  )
}

const TIME_CLASSES = ['rapid', 'blitz', 'bullet', 'daily'] as const

function RatingSection({ ratings }: { ratings: PlayerGamesData['ratings'] }) {
  const counts = TIME_CLASSES.map(
    (tc) => [tc, ratings.filter((r) => r.timeClass === tc).length] as const,
  ).filter(([, n]) => n > 0)
  const busiest = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
  const [picked, setPicked] = useState<string | null>(null)
  const timeClass = picked ?? busiest

  if (!timeClass) return null
  const points = ratings.filter((r) => r.timeClass === timeClass)
  const latest = points.at(-1)?.rating

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="display text-lg">Rating</h2>
        {latest && (
          <span className="display numeric text-lg text-primary">{latest}</span>
        )}
      </div>
      <Card className="gap-3 px-3 py-3">
        <div className="flex gap-1 rounded-full bg-secondary p-1">
          {counts.map(([tc]) => (
            <button
              data-cuelume-select=""
              key={tc}
              type="button"
              onClick={() => setPicked(tc)}
              aria-pressed={tc === timeClass}
              className={cn(
                'flex-1 rounded-full px-2 py-1 text-xs font-semibold capitalize transition-colors',
                tc === timeClass
                  ? 'bg-background text-foreground shadow-card'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tc}
            </button>
          ))}
        </div>
        <RatingChart points={points} />
      </Card>
    </section>
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
  username,
  game,
  accuracy,
}: {
  username: string
  game: PlayerGamesData['recent'][number]
  accuracy: number | null
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-card py-2.5 pl-3 pr-2 shadow-card">
      <a
        href={game.chessComUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
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
            {game.opening ?? game.timeClass}
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
            <ExternalLink className="size-3" />
          </span>
        </span>
      </a>
      <Button
        asChild
        size="icon-sm"
        variant="ghost"
        className="shrink-0 rounded-full text-primary"
      >
        <Link
          to="/players/$username/lesson"
          params={{ username }}
          search={{ game: game.chessComUrl }}
          aria-label={`Lesson from the game vs ${game.opponent}`}
          title="Lesson from this game"
        >
          <Book className="size-[1.1rem]" />
        </Link>
      </Button>
    </div>
  )
}
