import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import { getAllTimeFn } from '#/server/league.functions'
import type { AllTimeRow } from '#/server/queries.server'
import { PlayerLink } from '#/components/player-link'
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
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/all-time')({
  loader: () => getAllTimeFn(),
  component: AllTimePage,
})

/**
 * Only the sorting feature is registered — v9 has no global feature set, so a
 * table gets exactly the machinery it uses and nothing more.
 */
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
})

const helper = createColumnHelper<typeof features, AllTimeRow>()

const EMPTY_ROWS: Array<AllTimeRow> = []

function AllTimePage() {
  const data = Route.useLoaderData()

  return (
    <div className="space-y-8">
      <section className="rise-in">
        <p className="kicker">Across {data.seasons.length} season(s)</p>
        <h1 className="display mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          All-time records
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
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

type Data = Awaited<ReturnType<typeof getAllTimeFn>>

function AllTimeTable({ data }: { data: Data }) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('username', {
          header: 'Player',
          sortFn: 'alphanumeric',
          cell: (ctx) => <PlayerLink username={ctx.getValue()} />,
        }),
        helper.accessor('points', {
          header: 'Pts',
          sortFn: 'basic',
          sortDescFirst: true,
          meta: { numeric: true, emphasis: true },
        }),
        helper.accessor('played', {
          header: 'P',
          sortFn: 'basic',
          sortDescFirst: true,
          meta: { numeric: true },
        }),
        helper.accessor((row) => record(row.wins, row.draws, row.losses), {
          id: 'record',
          header: 'W–D–L',
          enableSorting: false,
          meta: { numeric: true },
        }),
        helper.accessor((row) => (row.wins + row.draws / 2) / (row.played || 1), {
          id: 'winRate',
          header: 'Score %',
          sortFn: 'basic',
          sortDescFirst: true,
          cell: (ctx) => winRate(ctx.row.original.wins, ctx.row.original.draws, ctx.row.original.losses),
          meta: { numeric: true },
        }),
        helper.accessor('seasonsPlayed', {
          header: 'Seasons',
          sortFn: 'basic',
          sortDescFirst: true,
          meta: { numeric: true },
        }),
        // One column per season — the breakdown grows with the club's history
        // rather than being fixed at build time.
        ...data.seasons.map((season) =>
          helper.accessor((row) => row.perSeason[season.id]?.points ?? null, {
            id: `season-${season.id}`,
            header: season.label,
            sortFn: 'basic',
            sortDescFirst: true,
            sortUndefined: 'last',
            cell: (ctx) => ctx.getValue() ?? '—',
            meta: { numeric: true, season: true },
          }),
        ),
      ]),
    [data.seasons],
  )

  const table = useTable({
    features,
    columns,
    data: data.rows.length > 0 ? data.rows : EMPTY_ROWS,
    initialState: { sorting: [{ id: 'points', desc: true }] },
    enableSortingRemoval: false,
  })

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
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id} className="hover:bg-transparent">
                    <TableHead className="w-12 pl-6">#</TableHead>
                    {group.headers.map((header) => {
                      const meta = header.column.columnDef.meta as
                        | { numeric?: boolean; season?: boolean }
                        | undefined
                      const sorted = header.column.getIsSorted()
                      const canSort = header.column.getCanSort()

                      return (
                        <TableHead
                          key={header.id}
                          className={cn(
                            meta?.numeric && 'text-right',
                            meta?.season && 'text-brass-dim',
                          )}
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={cn(
                                'inline-flex items-center gap-1 rounded transition-colors hover:text-brass',
                                meta?.numeric && 'flex-row-reverse',
                                sorted && 'text-brass',
                              )}
                            >
                              <table.FlexRender header={header} />
                              {sorted === 'asc' ? (
                                <ArrowUp className="size-3" />
                              ) : sorted === 'desc' ? (
                                <ArrowDown className="size-3" />
                              ) : (
                                <ChevronsUpDown className="size-3 opacity-40" />
                              )}
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="numeric pl-6 text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | {
                            numeric?: boolean
                            emphasis?: boolean
                            season?: boolean
                          }
                        | undefined

                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            meta?.numeric && 'numeric text-right',
                            meta?.emphasis &&
                              'text-base font-semibold text-brass',
                            meta?.season && 'text-muted-foreground',
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      )
                    })}
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
                  <span className="text-brass">in progress</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
