import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Clock } from '#/components/icons'
import { PlayerChip } from '#/components/player-chip'
import { Podium } from '#/components/podium'
import { Card } from '#/components/ui/card'
import { ScrollArea } from '#/components/ui/scroll-area'
import { countdown, relativeTime } from '#/lib/format'
import { leaderboardQuery } from '#/lib/queries'
import { seo } from '#/lib/seo'
import { cn } from '#/lib/utils'
import type { FixtureStatus, Outcome } from '#/server/queries.server'

export const Route = createFileRoute('/table')({
  head: () =>
    seo({
      title: 'Standings',
      description:
        'Live Misri chess club league table: points, wins, draws, losses and missed fixtures for every member, matchday by matchday.',
      path: '/table',
    }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(leaderboardQuery),
  component: TableScreen,
})

type Data = NonNullable<ReturnType<typeof useLeaderboard>>

function useLeaderboard() {
  return useSuspenseQuery(leaderboardQuery).data
}

/**
 * Live-tournament style board: one row per player, one narrow column per
 * matchday, and a running total on the right. The per-matchday cells are what
 * make the season legible at a glance — you can see who is playing their games
 * and who is bleeding forfeits.
 */
function TableScreen() {
  const data = useLeaderboard()

  return (
    <div className="space-y-4">
      <header className="pt-2 text-center">
        <p className="kicker">{data.season.label}</p>
        <h1 className="display mt-1 text-3xl">Leaderboard</h1>
        <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>Synced {relativeTime(data.lastSyncAt)}</span>
          {data.current && data.current.state === 'live' && (
            <span className="numeric flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
              <Clock className="size-3" />
              MD{data.current.matchday} ·{' '}
              {countdown(data.current.dueAt - data.now)}
            </span>
          )}
        </p>
      </header>

      {data.standings.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No players tracked yet.
        </Card>
      ) : (
        <>
          <Podium entries={data.standings.slice(0, 3)} />
          <Ranking rows={data.standings.slice(3)} from={4} />
          <h2 className="kicker px-1 pt-3">Matchday by matchday</h2>
          <Card className="overflow-hidden py-0">
            <Board data={data} />
          </Card>
        </>
      )}

      <Legend />
    </div>
  )
}

function Ranking({ rows, from }: { rows: Data['standings']; from: number }) {
  if (rows.length === 0) return null

  return (
    <section>
      <div className="kicker flex justify-between px-1 pb-2">
        <span>Ranking</span>
        <span>Points</span>
      </div>
      <ol className="space-y-2">
        {rows.map((row, index) => (
          <li
            key={row.playerId}
            className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-card"
          >
            <span className="numeric w-5 text-center text-sm font-semibold text-muted-foreground">
              {from + index}
            </span>
            <div className="min-w-0 flex-1">
              <PlayerChip username={row.username} />
              <p className="numeric mt-0.5 pl-10 text-[0.68rem] text-muted-foreground">
                {row.wins}W {row.draws}D {row.losses}L
                {row.forfeits > 0 && (
                  <span className="text-destructive">
                    {' '}
                    · {row.forfeits} missed
                  </span>
                )}
              </p>
            </div>
            <span className="display numeric text-xl text-primary">
              {row.points}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Board({ data }: { data: Data }) {
  const { matchdays } = data

  return (
    <ScrollArea horizontal>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card py-2 pl-3 pr-2 text-left font-medium">
              Player
            </th>
            {matchdays.map((matchday) => (
              <th
                key={matchday}
                className="numeric w-7 px-0.5 py-2 text-center font-medium"
              >
                {matchday}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {data.standings.map((row, index) => (
            <tr
              key={row.playerId}
              className="border-b border-border/40 last:border-0"
            >
              <th className="sticky left-0 z-10 bg-card py-2 pl-3 pr-2 text-left font-normal">
                <div className="flex items-center gap-2">
                  <span className="numeric w-3.5 shrink-0 text-[0.7rem] text-muted-foreground">
                    {index + 1}
                  </span>
                  <PlayerChip username={row.username} size="sm" />
                </div>
                <div className="numeric mt-0.5 pl-[1.375rem] text-[0.6rem] text-muted-foreground">
                  {row.wins}W {row.draws}D {row.losses}L
                  {row.forfeits > 0 && (
                    <span className="text-destructive"> {row.forfeits}✕</span>
                  )}
                </div>
              </th>

              {row.cells.map((cell) => (
                <td key={cell.matchday} className="px-0.5 py-2 text-center">
                  <Cell outcome={cell.outcome} status={cell.status} />
                </td>
              ))}

              <td className="numeric px-3 py-2 text-right text-base font-semibold text-primary">
                {row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  )
}

function Cell({
  outcome,
  status,
}: {
  outcome: Outcome | null
  status: FixtureStatus
}) {
  const label =
    outcome === 'win'
      ? 'W'
      : outcome === 'draw'
        ? '½'
        : outcome === 'loss'
          ? 'L'
          : outcome === 'forfeit'
            ? '✕'
            : status === 'bye'
              ? '–'
              : status === 'live'
                ? '•'
                : '·'

  return (
    <span
      className={cn(
        'numeric mx-auto grid size-6 place-items-center rounded text-[0.68rem] font-bold',
        outcome === 'win' && 'bg-win/25 text-foreground',
        outcome === 'draw' && 'bg-secondary text-muted-foreground',
        outcome === 'loss' && 'bg-destructive/15 text-destructive/90',
        outcome === 'forfeit' &&
          'bg-destructive/30 text-destructive ring-1 ring-destructive/50',
        !outcome && status === 'live' && 'text-primary',
        !outcome && status !== 'live' && 'text-muted-foreground/35',
      )}
      title={
        status === 'walkover'
          ? outcome === 'win'
            ? 'Walkover won — 3 points'
            : 'Walkover conceded — 1 point deducted'
          : outcome === 'forfeit'
            ? 'Window closed unplayed — 1 point deducted'
            : status === 'live'
              ? 'Window open now'
              : undefined
      }
    >
      {label}
    </span>
  )
}

function Legend() {
  const items = [
    { label: 'W', text: 'Win +3', className: 'bg-win/25' },
    { label: '½', text: 'Draw +1', className: 'bg-secondary' },
    { label: 'L', text: 'Loss 0', className: 'bg-destructive/15' },
    {
      label: '✕',
      text: 'Missed −1',
      className: 'bg-destructive/30 ring-1 ring-destructive/50',
    },
    { label: '•', text: 'Open now', className: '' },
  ]

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-1 text-[0.65rem] text-muted-foreground">
      {items.map((item) => (
        <span key={item.text} className="flex items-center gap-1.5">
          <span
            className={cn(
              'numeric grid size-4 place-items-center rounded text-[0.6rem] font-bold',
              item.className,
            )}
          >
            {item.label}
          </span>
          {item.text}
        </span>
      ))}
    </div>
  )
}
