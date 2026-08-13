import { createFileRoute } from '@tanstack/react-router'
import { Clock, ExternalLink } from 'lucide-react'

import { getPlayerFn } from '#/server/league.functions'
import { LiveRating, RatingsProvider } from '#/components/live-ratings'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Card } from '#/components/ui/card'
import { countdown, formatDate, record, relativeTime, winRate } from '#/lib/format'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/players/$username')({
  loader: ({ params }) => getPlayerFn({ data: { username: params.username } }),
  component: PlayerScreen,
  notFoundComponent: () => (
    <div className="py-20 text-center">
      <p className="kicker">Unknown player</p>
      <h1 className="display mt-2 text-2xl font-semibold">Not on the roster</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        This username isn&apos;t a tracked Misri club member.
      </p>
    </div>
  ),
})

function PlayerScreen() {
  const data = Route.useLoaderData()
  const { player, totals, history, games, fixtures, now } = data

  const open = fixtures.filter(
    (f) => f.status === 'live' || f.status === 'upcoming',
  )

  return (
    <RatingsProvider usernames={[player.username]}>
      <div className="space-y-5">
        <header className="flex items-center gap-3">
          <Avatar className="size-14 border border-brass/30">
            {player.avatar && <AvatarImage src={player.avatar} alt="" />}
            <AvatarFallback className="display bg-card text-lg text-brass">
              {player.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h1 className="display truncate text-2xl font-semibold">
              {player.username}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
              <LiveRating
                username={player.username}
                className="text-foreground"
              />
              <span>· joined {formatDate(player.joinedAt)}</span>
            </p>
          </div>

          {!player.active && (
            <Badge variant="outline" className="text-muted-foreground">
              Left
            </Badge>
          )}
        </header>

        <a
          href={`https://www.chess.com/member/${player.username}`}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brass/40 hover:text-brass"
        >
          View chess.com profile
          <ExternalLink className="size-3.5" />
        </a>

        <div className="grid grid-cols-4 gap-2">
          <Stat label="Pts" value={totals.points} />
          <Stat label="Played" value={totals.played} />
          <Stat
            label="Missed"
            value={totals.forfeits}
            tone={totals.forfeits > 0 ? 'bad' : undefined}
          />
          <Stat
            label="Score"
            value={winRate(totals.wins, totals.draws, totals.losses)}
          />
        </div>

        {open.length > 0 && (
          <Section title="Your fixtures">
            <Card className="p-0">
              <div className="divide-y divide-border/40">
                {open.map((fixture) => {
                  const opponent =
                    fixture.home === player.username ? fixture.away : fixture.home

                  return (
                    <div
                      key={fixture.id}
                      className="flex items-center gap-2 px-3 py-2.5"
                    >
                      <span className="numeric w-8 shrink-0 text-[0.65rem] text-muted-foreground">
                        MD{fixture.matchday}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium">
                        {fixture.bye ? 'Bye' : `vs ${opponent}`}
                      </span>
                      <span
                        className={cn(
                          'numeric flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold',
                          fixture.status === 'live'
                            ? 'bg-brass/15 text-brass'
                            : 'text-muted-foreground',
                        )}
                      >
                        <Clock className="size-3" />
                        {fixture.status === 'live'
                          ? `${countdown(fixture.dueAt - now)} left`
                          : formatDate(fixture.opensAt)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
          </Section>
        )}

        <Section title="By season">
          {history.length === 0 ? (
            <Empty>No seasons recorded yet.</Empty>
          ) : (
            <Card className="p-0">
              <div className="divide-y divide-border/40">
                {history.map((season) => (
                  <div
                    key={season.seasonId}
                    className="flex items-center gap-2 px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium">
                      {season.label}
                      {season.endedAt === null && (
                        <span className="ml-1.5 text-[0.6rem] text-brass">
                          current
                        </span>
                      )}
                    </span>
                    <span className="numeric text-[0.7rem] text-muted-foreground">
                      {record(season.wins, season.draws, season.losses)}
                      {season.forfeits > 0 && (
                        <span className="text-destructive">
                          {' '}
                          {season.forfeits}✕
                        </span>
                      )}
                    </span>
                    <span className="numeric w-8 shrink-0 text-right text-sm font-semibold text-brass">
                      {season.points}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Section>

        <Section title="Game history">
          {games.length === 0 ? (
            <Empty>No games recorded against other club members yet.</Empty>
          ) : (
            <div className="space-y-2">
              {games.map((game) => (
                <a
                  key={game.id}
                  href={game.chessComUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 transition-colors hover:border-brass/30"
                >
                  <Outcome outcome={game.outcome} />
                  <span className="min-w-0 flex-1 truncate text-[0.8rem]">
                    <span className="text-muted-foreground">vs </span>
                    {game.opponent}
                  </span>
                  <span className="flex shrink-0 flex-col items-end text-[0.6rem] text-muted-foreground">
                    <span>{relativeTime(game.endedAt)}</span>
                    <span
                      className={cn(
                        'uppercase tracking-wide',
                        game.counts
                          ? 'text-brass/80'
                          : 'text-muted-foreground/60',
                      )}
                    >
                      {game.counts ? `MD${game.matchday}` : 'friendly'}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </Section>
      </div>
    </RatingsProvider>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="display mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Outcome({ outcome }: { outcome: 'win' | 'draw' | 'loss' }) {
  return (
    <span
      className={cn(
        'numeric grid size-6 shrink-0 place-items-center rounded text-[0.68rem] font-bold',
        outcome === 'win' && 'bg-felt/25 text-foreground',
        outcome === 'draw' && 'bg-secondary text-muted-foreground',
        outcome === 'loss' && 'bg-destructive/15 text-destructive/90',
      )}
    >
      {outcome === 'win' ? 'W' : outcome === 'draw' ? '½' : 'L'}
    </span>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: 'bad'
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 px-2 py-2.5 text-center">
      <div
        className={cn(
          'numeric text-lg font-semibold',
          tone === 'bad' ? 'text-destructive' : 'text-brass',
        )}
      >
        {value}
      </div>
      <div className="text-[0.58rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-6 text-center text-xs text-muted-foreground">
      {children}
    </Card>
  )
}
