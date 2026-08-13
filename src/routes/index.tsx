import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

import { getLeaderboardFn, syncNowFn } from '#/server/league.functions'
import type { FixtureView } from '#/server/queries.server'
import { PlayerChip } from '#/components/player-chip'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { countdown, relativeTime } from '#/lib/format'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/')({
  loader: () => getLeaderboardFn(),
  component: HomeScreen,
})

type Data = Awaited<ReturnType<typeof getLeaderboardFn>>

function HomeScreen() {
  const data = Route.useLoaderData()

  return (
    <div className="space-y-6">
      <MatchdayCard data={data} />
      <TopPlayers data={data} />
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
    <div className="mb-2.5 flex items-baseline justify-between">
      <h2 className="display text-lg font-semibold">{title}</h2>
      {to && (
        <Link
          to={to}
          className="flex items-center gap-0.5 text-xs font-medium text-brass"
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
  const router = useRouter()
  const sync = useServerFn(syncNowFn)
  const current = data.current

  const mutation = useMutation({
    mutationFn: () => sync(),
    onSuccess: async (result) => {
      await router.invalidate()
      toast.success(
        result.gamesAdded === 0
          ? 'No new games'
          : `${result.gamesAdded} new game${result.gamesAdded === 1 ? '' : 's'}`,
        {
          description: result.errors.length
            ? `${result.errors.length} endpoint(s) failed.`
            : `${result.gamesLinked} counted towards fixtures.`,
        },
      )
    },
    onError: (error: Error) =>
      toast.error('Sync failed', { description: error.message }),
  })

  if (!current) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <h2 className="display text-lg font-semibold">No schedule yet</h2>
          <p className="mx-auto mt-1.5 max-w-[16rem] text-xs text-muted-foreground">
            Once fixtures are drawn, each matchday opens for{' '}
            {data.season.matchdayDays} days and every pairing has to be played
            before it closes.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/fixtures">Go to fixtures</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const remaining = current.dueAt - data.now
  const opensIn = current.opensAt - data.now
  const urgent = current.state === 'live' && remaining < 12 * 60 * 60 * 1000

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="display text-lg font-semibold">
          {current.state === 'upcoming' ? 'Next matchday' : 'This matchday'}
        </h2>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="flex items-center gap-1 text-xs font-medium text-brass disabled:opacity-60"
        >
          <RefreshCw
            className={cn('size-3.5', mutation.isPending && 'animate-spin')}
          />
          {mutation.isPending ? 'Syncing' : 'Sync'}
        </button>
      </div>

      <Card className="overflow-hidden">
        <div
          className={cn(
            'flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5',
            urgent ? 'bg-destructive/15' : 'bg-brass/10',
          )}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Matchday {current.matchday}
          </span>
          <span
            className={cn(
              'numeric flex items-center gap-1.5 text-xs font-semibold',
              urgent ? 'text-destructive' : 'text-brass',
            )}
          >
            <Clock className="size-3.5" />
            {current.state === 'upcoming'
              ? `opens in ${countdown(opensIn)}`
              : current.state === 'finished'
                ? 'season complete'
                : `${countdown(remaining)} left`}
          </span>
        </div>

        <CardContent className="space-y-2 p-3">
          {current.fixtures.map((fixture) => (
            <FixtureRow key={fixture.id} fixture={fixture} data={data} />
          ))}
        </CardContent>
      </Card>

      {current.state === 'live' && (
        <div className="mt-2 flex items-start gap-1.5 px-1">
          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-brass" />
          <p className="text-[0.7rem] leading-snug text-muted-foreground">
            Any fixture still unplayed when the window closes costs{' '}
            <span className="font-medium text-foreground">both</span> players a
            point.
          </p>
        </div>
      )}
    </section>
  )
}

function avatarFor(data: Data, username: string | null) {
  if (!username) return null
  return data.roster.find((p) => p.username === username)?.avatar ?? null
}

function FixtureRow({
  fixture,
  data,
}: {
  fixture: FixtureView
  data: Data
}) {
  if (fixture.bye) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-dashed border-border/60 px-3 py-2.5">
        <PlayerChip
          username={fixture.bye}
          avatar={avatarFor(data, fixture.bye)}
          size="sm"
          muted
        />
        <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          Bye
        </span>
      </div>
    )
  }

  if (!fixture.home || !fixture.away) return null

  const game = fixture.game

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <PlayerChip
          username={fixture.home}
          avatar={avatarFor(data, fixture.home)}
          size="sm"
          className="flex-1"
        />

        {game ? (
          <a
            href={game.chessComUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="numeric shrink-0 rounded-md border border-brass/30 bg-brass/10 px-2 py-0.5 text-[0.7rem] font-semibold text-brass"
          >
            {game.result === 'draw' ? '½–½' : game.homeWon ? '1–0' : '0–1'}
          </a>
        ) : (
          <span
            className={cn(
              'numeric shrink-0 rounded-md px-2 py-0.5 text-[0.65rem] font-semibold uppercase',
              fixture.status === 'expired'
                ? 'bg-destructive/15 text-destructive'
                : 'text-muted-foreground/70',
            )}
          >
            {fixture.status === 'expired' ? '−1 / −1' : 'vs'}
          </span>
        )}

        <div className="flex flex-1 justify-end">
          <PlayerChip
            username={fixture.away}
            avatar={avatarFor(data, fixture.away)}
            size="sm"
            className="flex-row-reverse"
          />
        </div>
      </div>
    </div>
  )
}

function TopPlayers({ data }: { data: Data }) {
  const top = data.standings.slice(0, 3)
  if (top.length === 0) return null

  const medal = ['border-brass/60 text-brass', 'border-border text-foreground', 'border-border text-muted-foreground']

  return (
    <section>
      <SectionHeader title="Top players" to="/table" />
      <Card>
        <CardContent className="divide-y divide-border/50 p-0">
          {top.map((row, index) => (
            <div key={row.playerId} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className={cn(
                  'numeric grid size-6 shrink-0 place-items-center rounded-full border text-[0.7rem] font-bold',
                  medal[index],
                )}
              >
                {index + 1}
              </span>
              <PlayerChip
                username={row.username}
                avatar={row.avatar}
                className="flex-1"
              />
              <span className="numeric text-sm font-semibold text-brass">
                {row.points}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}

function RecentResults({ data }: { data: Data }) {
  if (data.recentGames.length === 0) return null

  return (
    <section>
      <SectionHeader title="Recent games" to="/fixtures" />
      <div className="space-y-2">
        {data.recentGames.slice(0, 6).map((game) => (
          <a
            key={game.id}
            href={game.chessComUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 transition-colors hover:border-brass/30"
          >
            <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium">
              {game.white}
            </span>
            <span className="numeric shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-[0.7rem] text-brass">
              {game.result === 'white'
                ? '1–0'
                : game.result === 'black'
                  ? '0–1'
                  : '½–½'}
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-[0.8rem] font-medium">
              {game.black}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 pl-1 text-[0.6rem] text-muted-foreground">
              <span>{relativeTime(game.endedAt)}</span>
              <span
                className={cn(
                  'uppercase tracking-wide',
                  game.counts ? 'text-brass/80' : 'text-muted-foreground/60',
                )}
              >
                {game.counts ? `MD${game.matchday}` : 'friendly'}
              </span>
            </span>
            <ExternalLink className="size-3 shrink-0 text-muted-foreground/50" />
          </a>
        ))}
      </div>
    </section>
  )
}
