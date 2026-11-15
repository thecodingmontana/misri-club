import { useCallback, useRef, useState } from 'react'
import { MatchCard } from '#/components/match-card'
import { useInView, useLoop, useMotionStopped } from '#/lib/landing-motion'
import { cn } from '#/lib/utils'
import { Credit } from './format-cards'
import { PHOTOS } from './photos'

// Before and after: the club group chat keeping score, then Misri doing it.

const CHAT: Array<{ me: boolean; text: string }> = [
  { me: false, text: 'Who won last night?' },
  { me: true, text: 'Me, 2-0. Trust me 😅' },
  { me: false, text: "Screenshot or it didn't happen" },
  { me: false, text: "Wait, who's top of the table now??" },
  { me: true, text: 'Let me update the spreadsheet…' },
]
const TOTAL = CHAT.reduce((n, m) => n + m.text.length, 0)
// a pause at the end before it starts again, counted in ticks
const HOLD = 60

function Bubble({
  me,
  text,
  shown,
}: {
  me: boolean
  text: string
  shown: number
}) {
  return (
    <div className={cn('flex', me ? 'justify-end' : 'justify-start')}>
      <p
        className={cn(
          'grid max-w-[80%] rounded-2xl px-3 py-2 text-sm transition-opacity duration-200',
          me ? 'bg-foreground text-background' : 'bg-card text-foreground',
          // not typed yet: keep its space, show nothing
          shown === 0 && 'opacity-0',
        )}
      >
        {/* the full text holds the size so the card never jumps */}
        <span className="invisible col-start-1 row-start-1">{text}</span>
        <span className="col-start-1 row-start-1">{text.slice(0, shown)}</span>
      </p>
    </div>
  )
}

function Chat() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const stopped = useMotionStopped()
  // resting state: fully typed
  const [typed, setTyped] = useState(TOTAL)
  const tick = useCallback(
    () => setTyped((n) => (n >= TOTAL + HOLD ? 0 : n + 1)),
    [],
  )
  useLoop(inView && !stopped, 45, tick)

  let left = Math.min(typed, TOTAL)
  return (
    <div
      ref={ref}
      className="-rotate-2 space-y-2 rounded-[1.5rem] bg-background/95 p-3 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)] backdrop-blur"
    >
      <ul className="sr-only">
        {CHAT.map((m) => (
          <li key={m.text}>
            {m.me ? 'You' : 'Club member'}: {m.text}
          </li>
        ))}
      </ul>
      <div aria-hidden className="space-y-2">
        {CHAT.map((m) => {
          const shown = Math.max(0, Math.min(left, m.text.length))
          left -= m.text.length
          return <Bubble key={m.text} me={m.me} text={m.text} shown={shown} />
        })}
        <p
          className={cn(
            'text-right text-xs text-muted-foreground transition-opacity duration-300',
            typed >= TOTAL ? 'opacity-100' : 'opacity-0',
          )}
        >
          Seen
        </p>
      </div>
    </div>
  )
}

export function GroupChat() {
  return (
    <section aria-labelledby="before-after" className="l-reveal space-y-10">
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div>
          <p className="kicker text-primary">Before and after</p>
          <h2 id="before-after" className="mt-2 text-5xl md:text-7xl">
            <span className="l-condensed block">Stop keeping score</span>
            <span className="l-condensed block text-primary">
              in the group chat.
            </span>
          </h2>
        </div>
        <p className="text-pretty text-muted-foreground">
          Arguing over who won, screenshots as proof, a spreadsheet nobody
          trusts. Misri reads the result from chess.com instead.
        </p>
      </div>
      <div className="grid gap-8 md:grid-cols-[1.25fr_1fr] md:items-center">
        <div className="relative pb-24 md:pb-10">
          <img
            src="/landing/friends.webp"
            alt={PHOTOS.friends.alt}
            width={1200}
            height={800}
            loading="lazy"
            className="aspect-[4/3] w-full rounded-[1.75rem] object-cover outline-1 -outline-offset-1 outline-black/10"
          />
          <div className="absolute right-3 -bottom-2 w-[78%] max-w-sm md:-right-8">
            <Chat />
          </div>
        </div>
        <div className="space-y-3">
          <p className="kicker text-primary">On Misri</p>
          <div className="rotate-1 space-y-3 rounded-[1.75rem] bg-card p-4 shadow-card">
            <MatchCard
              label={<span className="kicker">Round 3 · Example</span>}
              home={{
                id: 'you',
                name: 'You',
                image: null,
                chessUsername: null,
              }}
              away={{
                id: 'amina',
                name: 'Amina',
                image: null,
                chessUsername: null,
              }}
              score={['1', '0']}
              winner="home"
              status="Final · read from chess.com"
            />
            <p className="text-sm text-muted-foreground">
              The game is found on chess.com and the table updates. Nobody has
              to send a screenshot.
            </p>
          </div>
          <Credit photos={['friends']} />
        </div>
      </div>
    </section>
  )
}
