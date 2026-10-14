import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import { Fire } from '#/components/icons'
import { TrainHeader } from '#/components/train-header'
import { Card } from '#/components/ui/card'
import type { ChartConfig } from '#/components/ui/chart'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart'
import { MASTER_GAMES } from '#/lib/masters'
import { OPENINGS } from '#/lib/openings'
import type { SavedGame } from '#/lib/play'
import { LEVELS, PLAY_KEY, savedGame } from '#/lib/play'
import type { Progress } from '#/lib/progress'
import { EMPTY, readProgress, streak, weakestThemes } from '#/lib/progress'
import type { Theme } from '#/lib/puzzle'
import { THEMES } from '#/lib/puzzle'
import { seo } from '#/lib/seo'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/train/progress')({
  head: () =>
    seo({
      title: 'Your progress',
      description:
        'Your chess training at a glance: streak, puzzles by theme, opening drills, master-game scores and your record against Stockfish.',
      path: '/train/progress',
      noindex: true,
    }),
  component: ProgressScreen,
})

/** Everything here lives in this browser; the server renders it empty. */
function useStored() {
  const [progress, setProgress] = useState<Progress>(EMPTY)
  const [record, setRecord] = useState<SavedGame['record']>({})
  useEffect(() => {
    setProgress(readProgress())
    try {
      const stored = savedGame.safeParse(
        JSON.parse(localStorage.getItem(PLAY_KEY) ?? 'null'),
      )
      if (stored.success) setRecord(stored.data.record)
    } catch {
      // Nothing stored: an empty record.
    }
  }, [])
  return { progress, record }
}

function ProgressScreen() {
  const { progress, record } = useStored()
  const puzzles = Object.values(progress.puzzles)
  const solved = progress.solved.done
  const drills = Object.values(progress.openings).reduce(
    (sum, tally) => sum + tally.done,
    0,
  )
  const guesses = Object.values(progress.masters)
  const found = guesses.reduce((sum, g) => sum + g.found, 0)
  const tried = guesses.reduce((sum, g) => sum + g.tried, 0)
  const empty =
    puzzles.length === 0 &&
    drills === 0 &&
    tried === 0 &&
    !Object.keys(record).length

  return (
    <div className="space-y-5 pt-2">
      <TrainHeader title="Your progress" />

      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Day streak"
          value={streak(progress.days)}
          icon={<Fire className="size-4 text-primary" />}
        />
        <Tile label="Puzzles solved" value={solved} />
        <Tile label="Opening runs" value={drills} />
        <Tile
          label="Master moves found"
          value={tried ? `${Math.round((found / tried) * 100)}%` : '—'}
        />
      </div>

      {empty ? (
        <Card className="gap-2 px-4 py-6 text-center">
          <p className="text-sm font-semibold">Nothing to show yet</p>
          <p className="text-xs text-muted-foreground">
            Solve a puzzle, drill an opening or guess a master game, and your
            progress appears here. It is saved in this browser.
          </p>
          <Link
            to="/train"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Start training
          </Link>
        </Card>
      ) : (
        <>
          <Calendar days={progress.days} />
          <ThemeChart puzzles={progress.puzzles} />
          <PractiseNext puzzles={progress.puzzles} />
          <Openings openings={progress.openings} />
          <Stockfish record={record} />
          <Masters masters={progress.masters} />
        </>
      )}
    </div>
  )
}

function Tile({
  label,
  value,
  icon,
}: {
  label: string
  value: number | string
  icon?: React.ReactNode
}) {
  return (
    <Card className="gap-0.5 px-4 py-3">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="display numeric text-2xl">{value}</span>
    </Card>
  )
}

/** The last four weeks, one square per day, oldest first. */
function Calendar({ days }: { days: Array<string> }) {
  const trained = new Set(days)
  const today = new Date()
  const squares = Array.from({ length: 28 }, (_, i) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (27 - i))
    const key = day.toLocaleDateString('en-CA')
    return { key, on: trained.has(key) }
  })
  const count = squares.filter((square) => square.on).length

  return (
    <Card className="gap-2 px-4 py-3">
      <p className="text-sm font-semibold">Training days</p>
      <div className="grid grid-cols-14 gap-1" aria-hidden>
        {squares.map((square) => (
          <span
            key={square.key}
            title={`${square.key}${square.on ? ': trained' : ''}`}
            className={cn(
              'aspect-square rounded-[4px]',
              square.on ? 'bg-primary' : 'bg-secondary',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        You trained on {count} of the last 28 days.
      </p>
    </Card>
  )
}

const themeConfig = {
  clean: { label: 'Solved cleanly', color: 'var(--primary)' },
  helped: { label: 'With a slip or hint', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

/** Puzzles per trainable theme, most practised first. */
function ThemeChart({ puzzles }: { puzzles: Progress['puzzles'] }) {
  const data = Object.entries(puzzles)
    .filter(([theme]) => theme in THEMES)
    .map(([theme, tally]) => ({
      theme: THEMES[theme as Theme],
      clean: tally.clean,
      helped: tally.done - tally.clean,
    }))
    .sort((a, b) => b.clean + b.helped - (a.clean + a.helped))
    .slice(0, 8)

  if (data.length === 0) return null

  return (
    <Card className="gap-2 px-4 py-3">
      <p className="text-sm font-semibold">Puzzles by theme</p>
      <ChartContainer
        config={themeConfig}
        className="aspect-auto w-full"
        style={{ height: data.length * 34 + 48 }}
        role="img"
        aria-label={data
          .map(
            (row) =>
              `${row.theme}: ${row.clean} clean, ${row.helped} with help`,
          )
          .join('; ')}
      >
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
          barCategoryGap={8}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="theme"
            width={112}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="clean"
            stackId="puzzles"
            fill="var(--color-clean)"
            stroke="var(--card)"
            strokeWidth={2}
          />
          <Bar
            dataKey="helped"
            stackId="puzzles"
            fill="var(--color-helped)"
            radius={[0, 4, 4, 0]}
            stroke="var(--card)"
            strokeWidth={2}
          />
        </BarChart>
      </ChartContainer>
    </Card>
  )
}

function PractiseNext({ puzzles }: { puzzles: Progress['puzzles'] }) {
  const weak = weakestThemes(
    Object.fromEntries(Object.entries(puzzles).filter(([t]) => t in THEMES)),
  )
  if (weak.length === 0) return null

  return (
    <Card className="gap-2 px-4 py-3">
      <p className="text-sm font-semibold">Practise next</p>
      <p className="text-xs text-muted-foreground">
        Your lowest clean-solve rates. A few more puzzles here will help most.
      </p>
      <div className="flex flex-wrap gap-2">
        {weak.map(({ theme, rate }) => (
          <Link
            key={theme}
            to="/train/puzzles"
            search={{ theme: theme as Theme }}
            className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold transition-colors duration-150 hover:bg-primary hover:text-primary-foreground"
          >
            {THEMES[theme as Theme]} · {Math.round(rate * 100)}%
          </Link>
        ))}
      </div>
    </Card>
  )
}

function Openings({ openings }: { openings: Progress['openings'] }) {
  const rows = OPENINGS.filter((course) => openings[course.slug])
  if (rows.length === 0) return null
  return (
    <Card className="gap-2 px-4 py-3">
      <p className="text-sm font-semibold">Openings drilled</p>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="text-start font-medium">Course</th>
            <th className="text-end font-medium">Runs</th>
            <th className="text-end font-medium">Perfect</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((course) => (
            <tr key={course.slug} className="border-t border-border/60">
              <td className="py-1.5">
                <Link
                  to="/train/openings/$slug"
                  params={{ slug: course.slug }}
                  className="hover:text-primary"
                >
                  {course.name.split(':')[0]}
                </Link>
              </td>
              <td className="numeric text-end">{openings[course.slug].done}</td>
              <td className="numeric text-end">
                {openings[course.slug].clean}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Stockfish({ record }: { record: SavedGame['record'] }) {
  const rows = LEVELS.filter((level) => record[level.label])
  if (rows.length === 0) return null
  return (
    <Card className="gap-2 px-4 py-3">
      <p className="text-sm font-semibold">Against Stockfish</p>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="text-start font-medium">Level</th>
            <th className="text-end font-medium">Won</th>
            <th className="text-end font-medium">Drawn</th>
            <th className="text-end font-medium">Lost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((level) => (
            <tr key={level.label} className="border-t border-border/60">
              <td className="py-1.5">{level.label}</td>
              <td className="numeric text-end">{record[level.label].win}</td>
              <td className="numeric text-end">{record[level.label].draw}</td>
              <td className="numeric text-end">{record[level.label].loss}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Masters({ masters }: { masters: Progress['masters'] }) {
  const rows = MASTER_GAMES.filter((game) => masters[game.slug])
  if (rows.length === 0) return null
  return (
    <Card className="gap-2 px-4 py-3">
      <p className="text-sm font-semibold">Best guess-the-move scores</p>
      <ul className="space-y-1.5 text-sm">
        {rows.map((game) => {
          const { found, tried } = masters[game.slug]
          return (
            <li key={game.slug} className="flex justify-between gap-2">
              <Link
                to="/train/masters/$slug"
                params={{ slug: game.slug }}
                className="hover:text-primary"
              >
                {game.title}
              </Link>
              <span className="numeric text-muted-foreground">
                {found}/{tried}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
