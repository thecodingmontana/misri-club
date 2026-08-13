import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'

import { getPlayerFn } from '#/server/league.functions'
import { LiveRating, RatingsProvider } from '#/components/live-ratings'
import { PlayerLink } from '#/components/player-link'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { formatDate, record, relativeTime, winRate } from '#/lib/format'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/players/$username')({
  loader: ({ params }) => getPlayerFn({ data: { username: params.username } }),
  component: PlayerPage,
  notFoundComponent: () => (
    <div className="py-24 text-center">
      <p className="kicker">Unknown player</p>
      <h1 className="display mt-3 text-3xl font-semibold">
        Not on the roster
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This username isn&apos;t a tracked Misri club member.
      </p>
    </div>
  ),
})

function PlayerPage() {
  const data = Route.useLoaderData()
  const { player, totals, history, games } = data

  return (
    <RatingsProvider usernames={[player.username]}>
      <div className="space-y-8">
        <section className="rise-in flex flex-wrap items-center gap-5">
          <Avatar className="size-16 border border-brass/30">
            {player.avatar && <AvatarImage src={player.avatar} alt="" />}
            <AvatarFallback className="display bg-card text-xl text-brass">
              {player.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="display text-3xl font-semibold tracking-tight sm:text-4xl">
                {player.username}
              </h1>
              {player.active ? (
                <Badge variant="outline" className="border-brass/40 text-brass">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Left the club
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Joined the club {formatDate(player.joinedAt)} · current rating{' '}
              <LiveRating
                username={player.username}
                className="text-foreground"
              />
            </p>
          </div>

          <a
            href={`https://www.chess.com/member/${player.username}`}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-brass/50 hover:text-brass"
          >
            chess.com profile
            <ExternalLink className="size-3.5" />
          </a>
        </section>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Career points" value={totals.points} />
          <Stat label="Games played" value={totals.played} />
          <Stat
            label="W–D–L"
            value={record(totals.wins, totals.draws, totals.losses)}
          />
          <Stat
            label="Score rate"
            value={winRate(totals.wins, totals.draws, totals.losses)}
          />
        </dl>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="rise-in lg:col-span-2">
            <CardHeader>
              <CardTitle className="display text-xl">By season</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {history.length === 0 ? (
                <Empty>No seasons recorded yet.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6">Season</TableHead>
                      <TableHead className="text-right">P</TableHead>
                      <TableHead className="text-right">W–D–L</TableHead>
                      <TableHead className="pr-6 text-right">Pts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((season) => (
                      <TableRow key={season.seasonId}>
                        <TableCell className="pl-6">
                          <span className="font-medium">{season.label}</span>
                          {season.endedAt === null && (
                            <span className="ml-2 text-xs text-brass">
                              current
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="numeric text-right text-muted-foreground">
                          {season.played}
                        </TableCell>
                        <TableCell className="numeric text-right">
                          {record(season.wins, season.draws, season.losses)}
                        </TableCell>
                        <TableCell className="numeric pr-6 text-right font-semibold text-brass">
                          {season.points}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="rise-in lg:col-span-3">
            <CardHeader>
              <CardTitle className="display text-xl">Game history</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {games.length === 0 ? (
                <Empty>
                  No games recorded against other club members yet.
                </Empty>
              ) : (
                <div className="max-h-[32rem] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-6">Opponent</TableHead>
                        <TableHead>As</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead className="pr-6 text-right">Played</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {games.map((game) => (
                        <TableRow key={game.id}>
                          <TableCell className="pl-6">
                            <PlayerLink username={game.opponent} />
                            {game.matchday && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                MD{game.matchday}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs uppercase tracking-wider text-muted-foreground">
                            {game.colour}
                          </TableCell>
                          <TableCell>
                            <Outcome outcome={game.outcome} />
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <a
                              href={game.chessComUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brass"
                            >
                              {relativeTime(game.endedAt)}
                              <ExternalLink className="size-3" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </RatingsProvider>
  )
}

function Outcome({ outcome }: { outcome: 'win' | 'draw' | 'loss' }) {
  return (
    <span
      className={cn(
        'numeric rounded border px-2 py-0.5 text-xs',
        outcome === 'win' && 'border-felt/50 bg-felt/15 text-foreground',
        outcome === 'draw' && 'border-border text-muted-foreground',
        outcome === 'loss' && 'border-destructive/40 text-destructive',
      )}
    >
      {outcome === 'win' ? 'Win' : outcome === 'draw' ? 'Draw' : 'Loss'}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="brass-edge overflow-hidden rounded-lg border border-border/70 bg-card/60 px-4 py-3">
      <dt className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="numeric mt-1 truncate text-xl font-semibold text-brass">
        {value}
      </dd>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
