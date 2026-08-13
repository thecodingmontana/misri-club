import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, ExternalLink, Trophy } from 'lucide-react'

import { getLeaderboardFn } from '#/server/league.functions'
import { RosterCard } from '#/components/roster-card'
import { Card, CardContent } from '#/components/ui/card'
import { formatDate, relativeTime } from '#/lib/format'

export const Route = createFileRoute('/club')({
  loader: () => getLeaderboardFn(),
  component: ClubScreen,
})

function ClubScreen() {
  const data = Route.useLoaderData()

  return (
    <div className="space-y-5">
      <header>
        <p className="kicker">chess.com club</p>
        <h1 className="display mt-1 text-3xl font-semibold tracking-tight">
          {data.club.name}
        </h1>
        <a
          href={data.club.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brass"
        >
          chess.com/club/{data.club.id}
          <ExternalLink className="size-3" />
        </a>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Members" value={data.roster.filter((p) => p.active).length} />
        <Stat label="Season" value={data.season.label.replace('Season ', 'S')} />
        <Stat label="Window" value={`${data.season.matchdayDays}d`} />
      </div>

      <Link
        to="/all-time"
        className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3 transition-colors hover:border-brass/30"
      >
        <Trophy className="size-4 text-brass" />
        <span className="flex-1">
          <span className="block text-sm font-medium">All-time records</span>
          <span className="block text-[0.68rem] text-muted-foreground">
            Career totals across every season
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>

      <RosterCard
        roster={data.roster}
        membersListable={data.club.membersListable}
        membersCount={data.club.membersCount}
        clubUrl={data.club.url}
      />

      <Card>
        <CardContent className="space-y-1.5 py-4 text-[0.7rem] leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">How scoring works.</span>{' '}
            Win +3, draw +1, loss 0. A fixture left unplayed when its{' '}
            {data.season.matchdayDays}-day window closes costs{' '}
            <span className="font-medium text-foreground">both</span> players a
            point.
          </p>
          <p>
            Only games played inside a fixture&apos;s window count towards the
            table. Other games between members still appear in the feed as
            friendlies but score nothing, so nobody can farm points by replaying
            the same opponent.
          </p>
          <p>
            Season started {formatDate(data.season.startedAt)} · last synced{' '}
            {relativeTime(data.lastSyncAt)}.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 text-center">
      <div className="numeric text-lg font-semibold text-brass">{value}</div>
      <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  )
}
