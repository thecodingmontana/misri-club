import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { CalendarPlus, Info, Lock, Shuffle } from 'lucide-react'
import { toast } from 'sonner'

import {
  generateFixturesFn,
  getFixturesFn,
  startNewSeasonFn,
} from '#/server/league.functions'
import type { FixtureRow } from '#/server/queries.server'
import { PlayerLink } from '#/components/player-link'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
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
import { formatDate } from '#/lib/format'
import { useAdmin } from '#/lib/use-admin'

export const Route = createFileRoute('/fixtures')({
  loader: () => getFixturesFn(),
  component: FixturesPage,
})

type Data = Awaited<ReturnType<typeof getFixturesFn>>

function FixturesPage() {
  const data = Route.useLoaderData()

  const legs = [1, 2].map((leg) => ({
    leg,
    matchdays: groupByMatchday(data.fixtures.filter((f) => f.leg === leg)),
  }))

  return (
    <div className="space-y-8">
      <FixturesHeader data={data} />

      {!data.generated ? (
        <Card className="rise-in">
          <CardContent className="py-16 text-center">
            <h2 className="display text-2xl font-semibold">
              No schedule drawn yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Generating fixtures draws a double round-robin from the{' '}
              <span className="numeric text-foreground">
                {data.activePlayers}
              </span>{' '}
              active club members — everyone plays everyone twice, once with each
              colour, across {data.projectedMatchdays} matchdays.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {legs.map(({ leg, matchdays }) => (
            <section key={leg} className="rise-in space-y-4">
              <div className="flex items-baseline gap-3">
                <h2 className="display text-xl font-semibold">
                  {leg === 1 ? 'First leg' : 'Second leg'}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {leg === 1 ? 'home fixtures' : 'colours reversed'}
                </span>
              </div>

              {matchdays.map(({ matchday, fixtures }) => (
                <MatchdayCard
                  key={matchday}
                  matchday={matchday}
                  fixtures={fixtures}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function groupByMatchday(rows: Array<FixtureRow>) {
  const map = new Map<number, Array<FixtureRow>>()
  for (const row of rows) {
    const bucket = map.get(row.matchday) ?? []
    bucket.push(row)
    map.set(row.matchday, bucket)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([matchday, fixtures]) => ({ matchday, fixtures }))
}

function FixturesHeader({ data }: { data: Data }) {
  const { isAdmin } = useAdmin()
  const router = useRouter()
  const generate = useServerFn(generateFixturesFn)
  const newSeason = useServerFn(startNewSeasonFn)

  const generateMutation = useMutation({
    mutationFn: () => generate(),
    onSuccess: async (result) => {
      await router.invalidate()
      toast.success(
        `${result.fixtures} fixtures across ${result.matchdays} matchdays`,
        { description: `${result.playerCount} players in the draw.` },
      )
    },
    onError: (error: Error) =>
      toast.error('Could not generate fixtures', { description: error.message }),
  })

  const seasonMutation = useMutation({
    mutationFn: () => newSeason(),
    onSuccess: async (season) => {
      await router.invalidate()
      toast.success(`${season.label} started`, {
        description:
          'The previous season is archived — its games and standings are still on the all-time page.',
      })
    },
    onError: (error: Error) =>
      toast.error('Could not start a new season', {
        description: error.message,
      }),
  })

  const busy = generateMutation.isPending || seasonMutation.isPending

  return (
    <section className="rise-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{data.season.label}</p>
          <h1 className="display mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            Fixtures
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Double round-robin · started {formatDate(data.season.startedAt)}
          </p>
        </div>

        {!isAdmin ? (
          <p className="text-sm text-muted-foreground">
            <Link to="/login" className="text-brass hover:underline">
              Sign in as admin
            </Link>{' '}
            to draw fixtures or start a season.
          </p>
        ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={busy || data.locked}
            variant={data.generated ? 'outline' : 'default'}
            className="gap-2"
            title={
              data.locked
                ? 'Fixtures are locked — a scheduled game has already been played'
                : undefined
            }
          >
            {data.locked ? (
              <Lock className="size-4" />
            ) : (
              <Shuffle className="size-4" />
            )}
            {data.generated ? 'Regenerate fixtures' : 'Generate fixtures'}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary" className="gap-2" disabled={busy}>
                <CalendarPlus className="size-4" />
                Start new season
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Close {data.season.label} and start the next one?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Nothing is deleted. This season&apos;s fixtures, games and
                  final table stay exactly as they are and become the archive on
                  the all-time page. A fresh season opens, ready for a new draw
                  including everyone currently in the club.
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
        )}
      </div>

      {data.locked && (
        <Notice icon={<Lock className="size-4 text-brass" />}>
          Fixtures are locked for {data.season.label} — a scheduled game has
          already been played, so the draw is now immutable. Start a new season
          to redraw.
        </Notice>
      )}

      {data.unscheduled.length > 0 && (
        <Notice icon={<Info className="size-4 text-brass" />}>
          <span className="font-medium text-foreground">
            Not scheduled this season:
          </span>{' '}
          {data.unscheduled.map((username, i) => (
            <span key={username}>
              {i > 0 && ', '}
              <PlayerLink username={username} className="text-sm" />
            </span>
          ))}
          . They joined after the draw — their games still count towards the
          table, they just have no fixtures.
        </Notice>
      )}
    </section>
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
    <div className="flex items-start gap-3 rounded-lg border border-brass/25 bg-brass/5 px-4 py-3 text-sm text-muted-foreground">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  )
}

function MatchdayCard({
  matchday,
  fixtures,
}: {
  matchday: number
  fixtures: Array<FixtureRow>
}) {
  const played = fixtures.filter((f) => f.game).length
  const scheduled = fixtures.filter((f) => f.home && f.away).length

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="display text-base font-semibold">
          Matchday {matchday}
        </CardTitle>
        <Badge
          variant="outline"
          className={
            played === scheduled && scheduled > 0
              ? 'border-brass/40 text-brass'
              : 'text-muted-foreground'
          }
        >
          <span className="numeric">
            {played}/{scheduled}
          </span>
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {fixtures.map((fixture) => (
          <FixtureLine key={fixture.id} fixture={fixture} />
        ))}
      </CardContent>
    </Card>
  )
}

function FixtureLine({ fixture }: { fixture: FixtureRow }) {
  if (fixture.bye) {
    return (
      <div className="flex items-center justify-between rounded-md border border-dashed border-border/60 px-3 py-2 text-sm">
        <PlayerLink username={fixture.bye} muted className="text-sm" />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Bye
        </span>
      </div>
    )
  }

  if (!fixture.home || !fixture.away) return null

  const game = fixture.game
  const homeWon = game
    ? game.result !== 'draw' &&
      (game.result === 'white') === (game.whiteUsername === fixture.home)
    : false
  const awayWon = game ? game.result !== 'draw' && !homeWon : false

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm">
      <span
        className={`min-w-0 flex-1 truncate ${homeWon ? 'font-semibold' : ''}`}
      >
        <PlayerLink username={fixture.home} className="text-sm" />
      </span>

      {game ? (
        <a
          href={game.chessComUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="numeric shrink-0 rounded border border-brass/30 bg-brass/10 px-2 py-0.5 text-xs text-brass hover:bg-brass/20"
          title="View on chess.com"
        >
          {game.result === 'draw'
            ? '½ – ½'
            : homeWon
              ? '1 – 0'
              : '0 – 1'}
        </a>
      ) : (
        <span className="numeric shrink-0 px-2 text-xs text-muted-foreground/70">
          vs
        </span>
      )}

      <span
        className={`min-w-0 flex-1 truncate text-right ${awayWon ? 'font-semibold' : ''}`}
      >
        <PlayerLink username={fixture.away} className="text-sm" />
      </span>
    </div>
  )
}
