import { useCallback, useRef, useState } from 'react'
import { PlayerAvatar } from '#/components/player-chip'
import { useInView, useLoop, useMotionStopped } from '#/lib/landing-motion'
import { cn } from '#/lib/utils'

// An example league that plays itself: results "arrive from chess.com", points
// move and the rows slide into their new order. Names are placeholders.

const PLAYERS = ['You', 'Amina', 'Brian', 'Wanjiru'] as const
type Name = (typeof PLAYERS)[number]
const SCRIPT: Array<{ white: Name; black: Name; winner: Name | null }> = [
  { white: 'Amina', black: 'Brian', winner: 'Amina' },
  { white: 'You', black: 'Wanjiru', winner: 'You' },
  { white: 'Brian', black: 'You', winner: null },
  { white: 'Wanjiru', black: 'Amina', winner: 'Wanjiru' },
  { white: 'You', black: 'Amina', winner: 'You' },
  { white: 'Brian', black: 'Wanjiru', winner: 'Brian' },
]
const ROW = 46

function tableAfter(played: number) {
  const points = Object.fromEntries(PLAYERS.map((p) => [p, 0])) as Record<
    Name,
    number
  >
  for (const game of SCRIPT.slice(0, played)) {
    if (game.winner) points[game.winner] += 3
    else {
      points[game.white] += 1
      points[game.black] += 1
    }
  }
  const order = [...PLAYERS].sort(
    (a, b) => points[b] - points[a] || PLAYERS.indexOf(a) - PLAYERS.indexOf(b),
  )
  return { points, order }
}

export function LeagueDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const stopped = useMotionStopped()
  // the resting state is the finished table
  const [played, setPlayed] = useState(SCRIPT.length)
  const tick = useCallback(
    () => setPlayed((n) => (n >= SCRIPT.length ? 0 : n + 1)),
    [],
  )
  useLoop(inView && !stopped, 2600, tick)

  const { points, order } = tableAfter(played)
  const last = played > 0 ? SCRIPT[played - 1] : null

  return (
    <div
      ref={ref}
      className="relative mx-auto w-full max-w-sm rounded-[1.75rem] bg-card p-4 shadow-card"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="kicker">Example league · Table</p>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
          Live
        </span>
      </div>
      <div className="relative" style={{ height: ROW * PLAYERS.length }}>
        {PLAYERS.map((name) => {
          const place = order.indexOf(name)
          return (
            <div
              key={name}
              className="absolute inset-x-0 flex items-center gap-3 rounded-xl px-2 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
              style={{ height: ROW, transform: `translateY(${place * ROW}px)` }}
            >
              <span className="numeric w-4 text-sm text-muted-foreground">
                {place + 1}
              </span>
              <PlayerAvatar username={name} className="size-7" />
              <span
                className={cn(
                  'flex-1 text-sm',
                  name === 'You' ? 'font-bold' : 'font-medium',
                )}
              >
                {name}
              </span>
              <span className="numeric text-sm font-bold">{points[name]}</span>
            </div>
          )
        })}
      </div>
      <p
        key={played}
        className="l-enter mt-3 rounded-xl bg-background px-3 py-2 text-xs text-muted-foreground"
        style={{ animationDelay: '0s' }}
        aria-live="off"
      >
        {last
          ? `Found on chess.com: ${
              last.winner
                ? `${last.winner} beat ${last.winner === last.white ? last.black : last.white}`
                : `${last.white} and ${last.black} drew`
            }`
          : 'New round. Fixtures are out.'}
      </p>
    </div>
  )
}
