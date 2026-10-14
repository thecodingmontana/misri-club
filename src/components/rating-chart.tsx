import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { ChartConfig } from '#/components/ui/chart'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart'
import { formatDate } from '#/lib/format'

interface Point {
  endedAt: number
  rating: number
}

const config = {
  rating: { label: 'Rating', color: 'var(--primary)' },
} satisfies ChartConfig

/**
 * One rating line over time. A single series needs no legend (the section
 * title names it); hovering or touching shows the exact rating and date.
 */
export function RatingChart({ points }: { points: Array<Point> }) {
  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">
        Not enough rated games in this time control yet.
      </p>
    )
  }

  const first = points[0].rating
  const last = points[points.length - 1].rating

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-44 w-full"
      role="img"
      aria-label={`Rating from ${first} to ${last}`}
    >
      <AreaChart
        data={points}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        accessibilityLayer
      >
        <defs>
          <linearGradient id="rating-fill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-rating)"
              stopOpacity={0.22}
            />
            <stop
              offset="100%"
              stopColor="var(--color-rating)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis
          dataKey="endedAt"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value: number) => formatDate(value)}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={['dataMin - 10', 'dataMax + 10']}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) =>
                formatDate(payload[0]?.payload.endedAt)
              }
            />
          }
        />
        <Area
          dataKey="rating"
          type="monotone"
          stroke="var(--color-rating)"
          strokeWidth={2}
          fill="url(#rating-fill)"
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }}
        />
      </AreaChart>
    </ChartContainer>
  )
}
