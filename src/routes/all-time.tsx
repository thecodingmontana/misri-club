import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type ReactNode, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from '#/components/icons'
import { PlayerChip } from '#/components/player-chip'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { formatDate, record, winRate } from '#/lib/format'
import { allTimeQuery } from '#/lib/queries'
import { seo } from '#/lib/seo'
import { cn } from '#/lib/utils'
import type { AllTimeData, AllTimeRow } from '#/server/queries.server'

export const Route = createFileRoute('/all-time')({
  head: () =>
    seo({
      title: 'All-time records',
      description:
        'Career totals for every Misri chess club member across all league seasons: points, results and score percentage.',
      path: '/all-time',
    }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allTimeQuery),
  component: AllTimePage,
})

interface Column {
  id: string
  header: string
  /** What the column sorts by; absent when it does not sort. */
  value?: (row: AllTimeRow) => string | number | null
  cell: (row: AllTimeRow) => ReactNode
  numeric?: boolean
  emphasis?: boolean
  season?: boolean
}

function columnsFor(seasons: AllTimeData['seasons']): Array<Column> {
  return [
    {
      id: 'username',
      header: 'Player',
      value: (row) => row.username,
      cell: (row) => <PlayerChip username={row.username} size="sm" />,
    },
    {
      id: 'points',
      header: 'Pts',
      value: (row) => row.points,
      cell: (row) => row.points,
      numeric: true,
      emphasis: true,
    },
    {
      id: 'played',
      header: 'P',
      value: (row) => row.played,
      cell: (row) => row.played,
      numeric: true,
    },
    {
      id: 'record',
      header: 'W–D–L',
      cell: (row) => record(row.wins, row.draws, row.losses),
      numeric: true,
    },
    {
      id: 'winRate',
      header: 'Score %',
      value: (row) => (row.wins + row.draws / 2) / (row.played || 1),
      cell: (row) => winRate(row.wins, row.draws, row.losses),
      numeric: true,
    },
    {
      id: 'seasonsPlayed',
      header: 'Seasons',
      value: (row) => row.seasonsPlayed,
      cell: (row) => row.seasonsPlayed,
      numeric: true,
    },
    // One column per season — the breakdown grows with the club's history
    // rather than being fixed at build time.
    ...seasons.map((season) => ({
      id: `season-${season.id}`,
      header: season.label,
      value: (row: AllTimeRow) => row.perSeason[season.id]?.points ?? null,
      cell: (row: AllTimeRow) => row.perSeason[season.id]?.points ?? '—',
      numeric: true,
      season: true,
    })),
  ]
}

function AllTimePage() {
  const { data } = useSuspenseQuery(allTimeQuery)

  return (
    <div className="space-y-8">
      <section className="rise-in pt-2 text-center">
        <p className="kicker">Across {data.seasons.length} season(s)</p>
        <h1 className="display mt-1 text-3xl">All-time records</h1>
        <p className="mx-auto mt-2 max-w-xs text-xs text-muted-foreground">
          Every season the club has played, summed per player. Nothing here is
          stored separately — it is a live roll-up of each season&apos;s final
          table, so archived seasons keep counting forever. Click a column to
          sort.
        </p>
      </section>

      <AllTimeTable data={data} />
      <SeasonList data={data} />
    </div>
  )
}

type Data = AllTimeData

function AllTimeTable({ data }: { data: Data }) {
  const columns = useMemo(() => columnsFor(data.seasons), [data.seasons])
  const [sort, setSort] = useState({ id: 'points', desc: true })

  const rows = useMemo(() => {
    const value = columns.find((column) => column.id === sort.id)?.value
    if (!value) return data.rows
    return [...data.rows].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      // Seasons someone missed sort last, whichever way the column runs.
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
      const order = x < y ? -1 : x > y ? 1 : 0
      return sort.desc ? -order : order
    })
  }, [columns, data.rows, sort])

  // Numbers start high-to-low; names start A–Z.
  const toggle = (id: string) =>
    setSort((current) =>
      current.id === id
        ? { id, desc: !current.desc }
        : { id, desc: id !== 'username' },
    )

  return (
    <Card className="rise-in">
      <CardHeader>
        <CardTitle className="display text-xl">Career table</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {data.rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            No completed standings yet. Once games are synced, all-time totals
            appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-6">#</TableHead>
                  {columns.map((column) => {
                    const sorted =
                      sort.id === column.id && (sort.desc ? 'desc' : 'asc')

                    return (
                      <TableHead
                        key={column.id}
                        className={cn(
                          column.numeric && 'text-right',
                          column.season && 'text-muted-foreground',
                        )}
                      >
                        {column.value ? (
                          <button
                            data-cuelume-select=""
                            type="button"
                            onClick={() => toggle(column.id)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded transition-colors hover:text-primary',
                              column.numeric && 'flex-row-reverse',
                              sorted && 'text-primary',
                            )}
                          >
                            {column.header}
                            {sorted === 'asc' ? (
                              <ArrowUp className="size-3" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ChevronsUpDown className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          column.header
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.playerId}>
                    <TableCell className="numeric pl-6 text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        className={cn(
                          column.numeric && 'numeric text-right',
                          column.emphasis &&
                            'text-base font-semibold text-primary',
                          column.season && 'text-muted-foreground',
                        )}
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
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

function SeasonList({ data }: { data: Data }) {
  return (
    <Card className="rise-in">
      <CardHeader>
        <CardTitle className="display text-xl">Seasons</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          {data.seasons.map((season) => (
            <li
              key={season.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <span className="font-medium">{season.label}</span>
              <span className="numeric text-xs text-muted-foreground">
                {formatDate(season.startedAt)} —{' '}
                {season.endedAt ? (
                  formatDate(season.endedAt)
                ) : (
                  <span className="text-primary">in progress</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
