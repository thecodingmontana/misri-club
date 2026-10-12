import { useState } from 'react'
import { formatDate } from '#/lib/format'

interface Point {
  endedAt: number
  rating: number
}

const WIDTH = 320
const HEIGHT = 140
const PAD = { top: 10, right: 8, bottom: 20, left: 34 }

/**
 * One rating line over time. A single series needs no legend (the section
 * title names it); hovering or touching shows the exact rating and date.
 */
export function RatingChart({ points }: { points: Array<Point> }) {
  const [active, setActive] = useState<number | null>(null)

  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">
        Not enough rated games in this time control yet.
      </p>
    )
  }

  const ratings = points.map((p) => p.rating)
  const min = Math.min(...ratings)
  const max = Math.max(...ratings)
  const span = Math.max(1, max - min)
  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
  const y = (r: number) => PAD.top + (1 - (r - min) / span) * innerH

  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`,
    )
    .join(' ')
  const area = `${path} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = ((event.clientX - box.left) / box.width) * WIDTH
    const index = Math.round(
      ((ratio - PAD.left) / innerW) * (points.length - 1),
    )
    setActive(Math.min(points.length - 1, Math.max(0, index)))
  }

  const shown = active === null ? null : points[active]

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
        role="img"
        aria-label={`Rating from ${points[0].rating} to ${points[points.length - 1].rating}, between ${min} and ${max}`}
      >
        <defs>
          <linearGradient id="rating-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[min, Math.round((min + max) / 2), max].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeDasharray="3 4"
            />
            <text
              x={PAD.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {tick}
            </text>
          </g>
        ))}

        <text
          x={PAD.left}
          y={HEIGHT - 4}
          className="fill-muted-foreground text-[9px]"
        >
          {formatDate(points[0].endedAt)}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 4}
          textAnchor="end"
          className="fill-muted-foreground text-[9px]"
        >
          {formatDate(points[points.length - 1].endedAt)}
        </text>

        <path d={area} fill="url(#rating-fill)" />
        <path
          d={path}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-primary dark:drop-shadow-[0_0_4px_var(--primary)]"
        />

        {shown && active !== null && (
          <g>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              className="stroke-muted-foreground/50"
            />
            <circle
              cx={x(active)}
              cy={y(shown.rating)}
              r="4"
              className="fill-primary stroke-background"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {shown && active !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-popover px-2 py-1 text-center shadow-card"
          style={{ left: `${(x(active) / WIDTH) * 100}%` }}
        >
          <div className="display numeric text-sm text-foreground">
            {shown.rating}
          </div>
          <div className="text-[0.6rem] text-muted-foreground">
            {formatDate(shown.endedAt)}
          </div>
        </div>
      )}
    </div>
  )
}
