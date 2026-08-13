import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { CalendarPlus, Clock, Info, Lock, Shuffle } from 'lucide-react'
import { toast } from 'sonner'

import {
  generateFixturesFn,
  getFixturesFn,
  startNewSeasonFn,
} from '#/server/league.functions'
import type { FixtureView } from '#/server/queries.server'
import { PlayerChip } from '#/components/player-chip'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { countdown, formatDate } from '#/lib/format'
import { useAdmin } from '#/lib/use-admin'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/fixtures')({
  loader: () => getFixturesFn(),
  component: FixturesScreen,
})

type Data = Awaited<ReturnType<typeof getFixturesFn>>
type Filter = 'all' | 'upcoming' | 'finished'

function FixturesScreen() {
  const data = Route.useLoaderData()
  const [filter, setFilter] = useState<Filter>('all')

  const matchdays = groupByMatchday(data.fixtures).filter((group) => {
    if (filter === 'all') return true
    if (filter === 'finished') {
      return group.fixtures.some(
        (f) => f.status === 'played' || f.status === 'expired',
      )
    }
    return group.fixtures.some(
      (f) => f.status === 'live' || f.status === 'upcoming',
    )
  })

  return (
    <div className="space-y-4">
      <Header data={data} />

      {!data.generated ? (
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="display text-lg font-semibold">
              No schedule drawn yet
            </h2>
            <p className="mx-auto mt-1.5 max-w-[17rem] text-xs leading-relaxed text-muted-foreground">
              A draw pairs all {data.activePlayers} active members twice — once
              with each colour — over {data.projectedMatchdays} matchdays. Each
              matchday stays open {data.season.matchdayDays} days, so the season
              runs about {data.projectedDays} days.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs filter={filter} onChange={setFilter} />
          <div className="space-y-3">
            {matchdays.map((group) => (
              <MatchdayCard
                key={group.matchday}
                group={group}
                now={data.now}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function groupByMatchday(rows: Array<FixtureView>) {
  const map = new Map<number, Array<FixtureView>>()
  for (const row of rows) {
    const bucket = map.get(row.matchday) ?? []
    bucket.push(row)
    map.set(row.matchday, bucket)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([matchday, fixtures]) => ({ matchday, fixtures }))
}

function Tabs({
  filter,
  onChange,
}: {
  filter: Filter
  onChange: (next: Filter) => void
}) {
  const tabs: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'finished', label: 'Finished' },
  ]

  return (
    <div className="flex gap-1 rounded-full border border-border/60 bg-card/60 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            filter === tab.id
              ? 'bg-brass/15 text-brass'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function Header({ data }: { data: Data }) {
  const { isAdmin } = useAdmin()
  const router = useRouter()
  const generate = useServerFn(generateFixturesFn)
  const newSeason = useServerFn(startNewSeasonFn)

  const generateMutation = useMutation({
    mutationFn: () => generate(),
    onSuccess: async (result) => {
      await router.invalidate()
      toast.success(`${result.fixtures} fixtures drawn`, {
        description: `${result.matchdays} matchdays · runs to ${formatDate(result.endsAt)}`,
      })
    },
    onError: (error: Error) =>
      toast.error('Could not generate fixtures', { description: error.message }),
  })

  const seasonMutation = useMutation({
    mutationFn: () => newSeason(),
    onSuccess: async (season) => {
      await router.invalidate()
      toast.success(`${season.label} started`, {
        description: 'The previous season is archived, not deleted.',
      })
    },
    onError: (error: Error) =>
      toast.error('Could not start a new season', {
        description: error.message,
      }),
  })

  const busy = generateMutation.isPending || seasonMutation.isPending

  return (
    <header className="space-y-3">
      <div>
        <p className="kicker">{data.season.label}</p>
        <h1 className="display mt-1 text-3xl font-semibold tracking-tight">
          Fixtures
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Double round-robin · {data.season.matchdayDays}-day windows
        </p>
      </div>

      {data.locked && (
        <Notice icon={<Lock className="size-3.5 text-brass" />}>
          The draw is locked — a scheduled game has been played, so fixtures are
          now immutable. Start a new season to redraw.
        </Notice>
      )}

      {data.unscheduled.length > 0 && (
        <Notice icon={<Info className="size-3.5 text-brass" />}>
          <span className="font-medium text-foreground">Not scheduled:</span>{' '}
          {data.unscheduled.join(', ')} — they joined after the draw, so they
          have no fixtures this season.
        </Notice>
      )}

      {isAdmin ? (
        <div className="flex gap-2">
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={busy || data.locked}
            size="sm"
            variant={data.generated ? 'outline' : 'default'}
            className="flex-1 gap-1.5"
          >
            {data.locked ? (
              <Lock className="size-3.5" />
            ) : (
              <Shuffle className="size-3.5" />
            )}
            {data.generated ? 'Regenerate' : 'Generate draw'}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 gap-1.5"
                disabled={busy}
              >
                <CalendarPlus className="size-3.5" />
                New season
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Close {data.season.label}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Nothing is deleted. This season&apos;s fixtures, games and
                  final table are kept and keep counting towards all-time
                  records. A fresh season opens, ready for a new draw.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => seasonMutation.mutate()}>
                  Start new season
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Link to="/login" className="text-brass">
            Sign in as admin
          </Link>{' '}
          to draw fixtures or start a season.
        </p>
      )}
    </header>
  )
}

function Notice({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-brass/25 bg-brass/5 px-3 py-2.5 text-[0.72rem] leading-relaxed text-muted-foreground">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  )
}

function MatchdayCard({
  group,
  now,
}: {
  group: { matchday: number; fixtures: Array<FixtureView> }
  now: number
}) {
  const playable = group.fixtures.filter((f) => f.home && f.away)
  const played = playable.filter((f) => f.status === 'played').length
  const window = group.fixtures[0]
  const live = now >= window.opensAt && now < window.dueAt
  const done = now >= window.dueAt

  return (
    <Card className="overflow-hidden p-0">
      <div
        className={cn(
          'flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2',
          live ? 'bg-brass/10' : 'bg-secondary/40',
        )}
      >
        <span className="text-xs font-semibold">Matchday {group.matchday}</span>
        <span className="numeric flex items-center gap-2 text-[0.65rem] text-muted-foreground">
          <span>
            {played}/{playable.length}
          </span>
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-1.5 py-0.5',
              live && 'bg-brass/15 font-semibold text-brass',
            )}
          >
            <Clock className="size-3" />
            {live
              ? `${countdown(window.dueAt - now)} left`
              : done
                ? formatDate(window.dueAt)
                : `opens ${formatDate(window.opensAt)}`}
          </span>
        </span>
      </div>

      <div className="divide-y divide-border/40">
        {group.fixtures.map((fixture) => (
          <FixtureLine key={fixture.id} fixture={fixture} />
        ))}
      </div>
    </Card>
  )
}

function FixtureLine({ fixture }: { fixture: FixtureView }) {
  if (fixture.bye) {
    return (
      <div className="flex items-center justify-between px-3 py-2">
        <PlayerChip username={fixture.bye} size="sm" muted />
        <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
          Bye
        </span>
      </div>
    )
  }

  if (!fixture.home || !fixture.away) return null

  const game = fixture.game

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[0.8rem]',
          game && game.homeWon && 'font-semibold',
        )}
      >
        {fixture.home}
      </span>

      {game ? (
        <a
          href={game.chessComUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="numeric shrink-0 rounded border border-brass/30 bg-brass/10 px-1.5 py-0.5 text-[0.68rem] font-semibold text-brass"
        >
          {game.result === 'draw' ? '½–½' : game.homeWon ? '1–0' : '0–1'}
        </a>
      ) : fixture.status === 'expired' ? (
        <span
          className="numeric shrink-0 rounded bg-destructive/20 px-1.5 py-0.5 text-[0.65rem] font-semibold text-destructive"
          title="Window closed unplayed — both players lost a point"
        >
          −1 / −1
        </span>
      ) : (
        <span
          className={cn(
            'numeric shrink-0 px-1.5 text-[0.65rem] uppercase',
            fixture.status === 'live'
              ? 'font-semibold text-brass'
              : 'text-muted-foreground/60',
          )}
        >
          {fixture.status === 'live' ? 'play now' : 'vs'}
        </span>
      )}

      <span
        className={cn(
          'min-w-0 flex-1 truncate text-right text-[0.8rem]',
          game && !game.homeWon && game.result !== 'draw' && 'font-semibold',
        )}
      >
        {fixture.away}
      </span>
    </div>
  )
}
