import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { FixtureScore, wonFixture } from '#/components/fixture-score'
import { AlertTriangle, ChevronRight, RefreshCw } from '#/components/icons'
import { PlayerChip } from '#/components/player-chip'
import { Podium } from '#/components/podium'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { countdown, relativeTime } from '#/lib/format'
import { leaderboardQuery, useSyncNow } from '#/lib/queries'
import { cn } from '#/lib/utils'
import type { FixtureView } from '#/server/queries.server'

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(leaderboardQuery),
  component: HomeScreen,
})

type Data = ReturnType<typeof useLeaderboard>

function useLeaderboard() {
  return useSuspenseQuery(leaderboardQuery).data
}

function HomeScreen() {
  const data = useLeaderboard()

  return (
    <div className="space-y-7">
      <header className="pt-2 text-center">
        <p className="kicker">{data.season.label}</p>
        <h1 className="display mt-1 text-3xl">{data.club.name} League</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Synced {relativeTime(data.lastSyncAt)}
        </p>
      </header>

      <MatchdayCard data={data} />

      {data.standings.length > 0 && (
        <section>
          <SectionHeader title="Leaders" to="/table" />
          <Podium entries={data.standings.slice(0, 3)} />
        </section>
      )}

      <RecentResults data={data} />
    </div>
  )
}

function SectionHeader({
  title,
  to,
}: {
  title: string
  to?: '/table' | '/fixtures'
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <h2 className="display text-lg">{title}</h2>
      {to && (
        <Link
          to={to}
          className="flex items-center gap-0.5 text-xs font-semibold text-primary"
        >
          See all
          <ChevronRight className="size-3.5" />
        </Link>
      )}
    </div>
  )
}

/**
 * The pressure valve of the whole league: which matchday is open and how long
 * is left before every unplayed fixture in it costs both players a point.
 */
function MatchdayCard({ data }: { data: Data }) {
  const sync = useSyncNow()
  const current = data.current

  if (!current) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <h2 className="display text-lg">No schedule yet</h2>
          <p className="mx-auto mt-1.5 max-w-[16rem] text-xs text-muted-foreground">
            Once fixtures are drawn, each matchday opens for{' '}
            {data.season.matchdayDays} days and every pairing has to be played
            before it closes.
          </p>
          <Button asChild size="sm" className="mt-4 rounded-full">
            <Link to="/fixtures">Go to fixtures</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const window = current.dueAt - current.opensAt
  const remaining = current.dueAt - data.now
  const left =
    current.state === 'live' ? Math.min(1, Math.max(0, remaining / window)) : 1
  const urgent = current.state === 'live' && remaining < 12 * 60 * 60 * 1000
  const pairings = current.fixtures.filter((f) => f.home && f.away)
  const decided = pairings.filter(
    (f) => f.status === 'played' || f.status === 'walkover',
  )

  return (
    <section>
      <SectionHeader
        title={current.state === 'upcoming' ? 'Next matchday' : 'This matchday'}
        to="/fixtures"
      />

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-4 px-4 py-4">
          <CountdownRing fraction={left} urgent={urgent}>
            <span className="kicker text-[0.55rem]">MD</span>
            <span className="display numeric text-2xl leading-none">
              {current.matchday}
            </span>
          </CountdownRing>

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'display numeric text-xl',
                urgent && 'text-destructive',
              )}
            >
              {current.state === 'upcoming'
                ? `Opens in ${countdown(current.opensAt - data.now)}`
                : current.state === 'finished'
                  ? 'Season complete'
                  : `${countdown(remaining)} left`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {decided.length} of {pairings.length} decided
            </p>
          </div>

          <Button
            variant="secondary"
            size="icon"
            className="rounded-full"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            aria-label="Sync with chess.com"
            title="Pull the latest games from chess.com"
          >
            <RefreshCw className={cn(sync.isPending && 'animate-spin')} />
          </Button>
        </div>

        <div className="space-y-1.5 border-t border-border/60 bg-background/40 p-2">
          {current.fixtures.map((fixture) => (
            <FixtureRow key={fixture.id} fixture={fixture} />
          ))}
        </div>
      </Card>

      {current.state === 'live' && (
        <p className="mt-2 flex items-start gap-1.5 px-1 text-[0.7rem] leading-snug text-muted-foreground">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-flame" />
          <span>
            Any fixture still unplayed when the window closes costs{' '}
            <span className="font-semibold text-foreground">both</span> players
            a point.
          </span>
        </p>
      )}
    </section>
  )
}

/** Time left in the window as a ring: full when it opens, empty at the deadline. */
function CountdownRing({
  fraction,
  urgent,
  children,
}: {
  fraction: number
  urgent: boolean
  children: React.ReactNode
}) {
  const radius = 28
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative grid size-[4.5rem] shrink-0 place-items-center">
      <svg
        viewBox="0 0 64 64"
        className="absolute inset-0 -rotate-90 dark:drop-shadow-[0_0_6px_var(--primary)]"
        aria-hidden
      >
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-secondary"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={urgent ? 'stroke-destructive' : 'stroke-primary'}
        />
      </svg>
      <span className="relative flex flex-col items-center">{children}</span>
    </div>
  )
}

function FixtureRow({ fixture }: { fixture: FixtureView }) {
  if (fixture.bye) {
    return (
      <div className="flex items-center justify-between rounded-xl px-3 py-2">
        <PlayerChip username={fixture.bye} size="sm" muted />
        <span className="kicker">Bye</span>
      </div>
    )
  }

  if (!fixture.home || !fixture.away) return null

  return (
    <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2">
      <PlayerChip
        username={fixture.home}
        size="sm"
        className={cn('flex-1', wonFixture(fixture, 'home') && 'font-bold')}
      />
      <FixtureScore fixture={fixture} />
      <div className="flex flex-1 justify-end">
        <PlayerChip
          username={fixture.away}
          size="sm"
          className={cn(
            'flex-row-reverse',
            wonFixture(fixture, 'away') && 'font-bold',
          )}
        />
      </div>
    </div>
  )
}

function RecentResults({ data }: { data: Data }) {
  if (data.recentGames.length === 0) return null

  return (
    <section>
      <SectionHeader title="Recent games" />
      <div className="space-y-2">
        {data.recentGames.slice(0, 6).map((game) => (
          <a
            key={game.id}
            href={game.chessComUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2 rounded-2xl bg-card px-3 py-2.5 shadow-card transition-colors hover:bg-secondary"
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[0.82rem]',
                game.result === 'white' ? 'font-bold' : 'font-medium',
              )}
            >
              {game.white}
            </span>
            <span className="numeric shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-bold text-primary">
              {game.result === 'white'
                ? '1–0'
                : game.result === 'black'
                  ? '0–1'
                  : '½–½'}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-right text-[0.82rem]',
                game.result === 'black' ? 'font-bold' : 'font-medium',
              )}
            >
              {game.black}
            </span>
            <span className="flex w-14 shrink-0 flex-col items-end gap-0.5 text-[0.62rem] text-muted-foreground">
              <span>{relativeTime(game.endedAt)}</span>
              <span
                className={cn(
                  'font-semibold uppercase tracking-wide',
                  game.counts ? 'text-primary' : 'text-muted-foreground/70',
                )}
              >
                {game.counts ? `MD${game.matchday}` : 'friendly'}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
