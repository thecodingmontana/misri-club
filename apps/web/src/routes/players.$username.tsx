import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from '#/components/icons'

import { LiveRating, RatingsProvider } from '#/components/live-ratings'
import { FixtureCard, GameCard } from '#/components/match-card'
import { PlayerAnalysis } from '#/components/player-analysis'
import { PlayerAvatar } from '#/components/player-chip'
import { Badge } from '#/components/ui/badge'
import { Card } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { formatDate, record, relativeTime, winRate } from '#/lib/format'
import { playerGamesQuery, playerQuery } from '#/lib/queries'
import { seo } from '#/lib/seo'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/players/$username')({
  loader: ({ context, params }) => {
    // Analysis data is heavier and below the fold: start it, don't wait on it.
    void context.queryClient.prefetchQuery(playerGamesQuery(params.username))
    return context.queryClient.ensureQueryData(playerQuery(params.username))
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.player.displayName ?? params.username
    const totals = loaderData?.totals
    return seo({
      title: name,
      description: totals
        ? `${name} in the Misri chess club league: ${totals.points} points from ${totals.played} games (${totals.wins} wins, ${totals.draws} draws, ${totals.losses} losses), with a chess.com game analysis.`
        : `${name}'s Misri chess club league record and game analysis.`,
      path: `/players/${params.username}`,
      jsonLd: {
        '@type': 'ProfilePage',
        mainEntity: {
          '@type': 'Person',
          name,
          image: loaderData?.player.avatar ?? undefined,
          sameAs: [`https://www.chess.com/member/${params.username}`],
        },
      },
    })
  },
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
  const { username } = Route.useParams()
  const { data } = useSuspenseQuery(playerQuery(username))
  const analysis = useQuery(playerGamesQuery(username))
  const { player, totals, history, games, fixtures, now } = data

  const open = fixtures.filter(
    (f) => f.status === 'live' || f.status === 'upcoming',
  )

  return (
    <RatingsProvider usernames={[player.username]}>
      <div className="space-y-5">
        <section className="flex flex-col items-center pt-2 text-center">
          <PlayerAvatar
            username={player.username}
            className="size-24 rounded-full border-[3px] border-primary bg-card dark:shadow-[0_0_24px_-4px_var(--primary)]"
          />
          <h1 className="display mt-3 text-2xl">{player.username}</h1>
          <a
            href={`https://www.chess.com/member/${player.username}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            @{player.username} on chess.com
            <ExternalLink className="size-3" />
          </a>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-primary px-3 py-0.5 text-[0.7rem] font-bold text-primary-foreground">
              <LiveRating username={player.username} />
            </span>
            {!player.active && (
              <Badge variant="outline" className="rounded-full">
                Left the club
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-[0.68rem] text-muted-foreground">
            Joined {formatDate(player.joinedAt)}
          </p>
        </section>

        <div className="grid grid-cols-4 divide-x divide-border/70 rounded-2xl bg-card py-3 shadow-card">
          <Stat label="Points" value={totals.points} />
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

        <Tabs defaultValue="league">
          <TabsList className="h-10! w-full rounded-full bg-secondary p-1">
            <TabsTrigger value="league" className="rounded-full">
              League
            </TabsTrigger>
            <TabsTrigger value="analysis" className="rounded-full">
              Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="pt-3">
            {analysis.data ? (
              <PlayerAnalysis username={player.username} data={analysis.data} />
            ) : analysis.isError ? (
              <Empty>Could not load this player&apos;s games.</Empty>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="league" className="space-y-5 pt-3">
            {open.length > 0 && (
              <Section title="Your fixtures">
                <div className="space-y-2">
                  {open.map((fixture) => (
                    <FixtureCard
                      key={fixture.id}
                      fixture={fixture}
                      now={now}
                      label={`Matchday ${fixture.matchday}`}
                    />
                  ))}
                </div>
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
                            <span className="ml-1.5 text-[0.6rem] text-primary">
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
                        <span className="numeric w-8 shrink-0 text-right text-sm font-semibold text-primary">
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
                    <GameCard
                      key={game.id}
                      white={game.white}
                      black={game.black}
                      result={game.result}
                      href={game.chessComUrl}
                      label={
                        game.counts
                          ? `${game.seasonLabel} · Matchday ${game.matchday}`
                          : `${game.seasonLabel} · Friendly`
                      }
                      status={relativeTime(game.endedAt)}
                    />
                  ))}
                </div>
              )}
            </Section>
          </TabsContent>
        </Tabs>
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
      <h2 className="display mb-2 px-1 text-lg">{title}</h2>
      {children}
    </section>
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
    <div className="px-1 text-center">
      <div className="kicker text-[0.58rem]">{label}</div>
      <div
        className={cn(
          'display numeric mt-0.5 text-xl',
          tone === 'bad' ? 'text-destructive' : 'text-primary',
        )}
      >
        {value}
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
