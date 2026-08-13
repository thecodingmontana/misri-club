import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { getLeaderboardFn, syncNowFn } from '#/server/league.functions'
import { LiveRating, RatingsProvider } from '#/components/live-ratings'
import { PlayerLink } from '#/components/player-link'
import { RosterCard } from '#/components/roster-card'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { formatDate, relativeTime } from '#/lib/format'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/')({
  loader: () => getLeaderboardFn(),
  component: Leaderboard,
})

function Leaderboard() {
  const data = Route.useLoaderData()
  const usernames = data.standings.map((row) => row.username)

  return (
    <RatingsProvider usernames={usernames}>
      <div className="space-y-8">
        <SeasonHeader data={data} />

        <div className="grid gap-6 lg:grid-cols-3">
          <StandingsCard data={data} />
          <div className="space-y-6">
            <RosterCard
              roster={data.roster}
              membersListable={data.club.membersListable}
              membersCount={data.club.membersCount}
              clubUrl={data.club.url}
            />
            <RecentGamesCard data={data} />
          </div>
        </div>
      </div>
    </RatingsProvider>
  )
}

type Data = Awaited<ReturnType<typeof getLeaderboardFn>>

function SeasonHeader({ data }: { data: Data }) {
  const router = useRouter()
  const sync = useServerFn(syncNowFn)

  const mutation = useMutation({
    mutationFn: () => sync(),
    onSuccess: async (result) => {
      await router.invalidate()
      const parts = [
        result.gamesAdded === 0
          ? 'No new games'
          : `${result.gamesAdded} new game${result.gamesAdded === 1 ? '' : 's'}`,
        `${result.archivesFetched} archives scanned`,
      ]
      if (result.roster.added.length > 0) {
        parts.push(`${result.roster.added.length} new member(s)`)
      }
      toast.success(parts.join(' · '), {
        description: result.errors.length
          ? `${result.errors.length} endpoint(s) failed — see server logs.`
          : result.roster.membersVisible
            ? undefined
            : 'Club is private, so its roster is managed by hand.',
      })
    },
    onError: (error: Error) => toast.error('Sync failed', { description: error.message }),
  })

  return (
    <section className="rise-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{data.season.label} · in progress</p>
          <h1 className="display mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            Club Standings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Started {formatDate(data.season.startedAt)} · last synced{' '}
            <span className="text-foreground">
              {relativeTime(data.lastSyncAt)}
            </span>
          </p>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="gap-2"
        >
          <RefreshCw
            className={cn('size-4', mutation.isPending && 'animate-spin')}
          />
          {mutation.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Players" value={data.stats.players} />
        <Stat label="Games recorded" value={data.stats.totalGames} />
        <Stat
          label="Fixtures played"
          value={`${data.stats.playedFixtures}/${data.stats.scheduledFixtures}`}
        />
        <Stat
          label="Leader"
          value={data.standings[0]?.username ?? '—'}
          mono={false}
        />
      </dl>
    </section>
  )
}

function Stat({
  label,
  value,
  mono = true,
}: {
  label: string
  value: string | number
  mono?: boolean
}) {
  return (
    <div className="brass-edge overflow-hidden rounded-lg border border-border/70 bg-card/60 px-4 py-3">
      <dt className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1 truncate text-xl font-semibold text-brass',
          mono && 'numeric',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function StandingsCard({ data }: { data: Data }) {
  return (
    <Card className="rise-in lg:col-span-2">
      <CardHeader>
        <CardTitle className="display text-xl">Table</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {data.standings.length === 0 ? (
          <Empty>
            {data.club.membersListable ? (
              <>
                No players yet — hit <strong>Sync now</strong> to pull the club
                roster from chess.com.
              </>
            ) : (
              <>
                No players yet — add club members by username in the{' '}
                <strong>Roster</strong> panel, then hit <strong>Sync now</strong>
                .
              </>
            )}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-6">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                  <TableHead className="text-right">P</TableHead>
                  <TableHead className="text-right">W</TableHead>
                  <TableHead className="text-right">D</TableHead>
                  <TableHead className="text-right">L</TableHead>
                  <TableHead className="pr-6 text-right">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.standings.map((row, index) => (
                  <TableRow key={row.playerId}>
                    <TableCell className="numeric pl-6 text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PlayerLink username={row.username} />
                        {index === 0 && row.points > 0 && (
                          <Badge
                            variant="outline"
                            className="border-brass/40 text-brass"
                          >
                            Leader
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <LiveRating username={row.username} />
                    </TableCell>
                    <TableCell className="numeric text-right text-muted-foreground">
                      {row.played}
                    </TableCell>
                    <TableCell className="numeric text-right">
                      {row.wins}
                    </TableCell>
                    <TableCell className="numeric text-right">
                      {row.draws}
                    </TableCell>
                    <TableCell className="numeric text-right">
                      {row.losses}
                    </TableCell>
                    <TableCell className="numeric pr-6 text-right text-base font-semibold text-brass">
                      {row.points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RecentGamesCard({ data }: { data: Data }) {
  return (
    <Card className="rise-in">
      <CardHeader>
        <CardTitle className="display text-xl">Recent games</CardTitle>
      </CardHeader>
      <CardContent>
        {data.recentGames.length === 0 ? (
          <Empty>
            Nothing played yet this season. Games between two club members show
            up here automatically once they finish.
          </Empty>
        ) : (
          <ul className="space-y-3">
            {data.recentGames.map((game) => (
              <li
                key={game.id}
                className="rounded-lg border border-border/60 bg-background/40 p-3"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      title="White"
                      className="size-2 shrink-0 rounded-full bg-parchment ring-1 ring-border"
                      style={{ background: 'oklch(0.93 0.014 82)' }}
                    />
                    <PlayerLink
                      username={game.white}
                      className="truncate text-sm"
                    />
                  </span>
                  <Score result={game.result} />
                  <span className="flex min-w-0 items-center justify-end gap-1.5">
                    <PlayerLink
                      username={game.black}
                      className="truncate text-sm"
                    />
                    <span
                      aria-hidden
                      title="Black"
                      className="size-2 shrink-0 rounded-full ring-1 ring-border"
                      style={{ background: 'oklch(0.24 0.019 50)' }}
                    />
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {game.matchday ? `Matchday ${game.matchday}` : 'Friendly'}
                    {game.timeClass ? ` · ${game.timeClass}` : ''}
                  </span>
                  <a
                    href={game.chessComUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 hover:text-brass"
                  >
                    {relativeTime(game.endedAt)}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Score({ result }: { result: 'white' | 'black' | 'draw' }) {
  const label =
    result === 'white' ? '1 – 0' : result === 'black' ? '0 – 1' : '½ – ½'

  return (
    <span className="numeric shrink-0 rounded border border-border/70 bg-card px-2 py-0.5 text-xs text-brass">
      {label}
    </span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
