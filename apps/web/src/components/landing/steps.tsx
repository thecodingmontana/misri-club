import { type CSSProperties, type ReactNode, useState } from 'react'
import { Trophy } from '#/components/icons'
import { MatchCard } from '#/components/match-card'
import { PlayerAvatar } from '#/components/player-chip'
import { useMotionStopped } from '#/lib/landing-motion'
import { cn } from '#/lib/utils'
import { Credit } from './format-cards'
import { PHOTOS } from './photos'

// How it works, told as a story: each step's bar is the clock, and when it
// fills the next step plays. Hover or focus a step to jump to it.

const CLIP = '4.5s'
const you = { id: 'you', name: 'You', image: null, chessUsername: null }
const friend = {
  id: 'friend',
  name: 'A friend',
  image: null,
  chessUsername: null,
}

const STEPS: Array<{
  title: string
  photo: keyof typeof PHOTOS
  body: string
  frame: ReactNode
}> = [
  {
    title: 'Create it',
    photo: 'step-create',
    body: 'Pick a league or a knockout, the points and your rules for unplayed matches.',
    frame: (
      <div className="space-y-3">
        <div className="flex gap-2">
          <span className="flex-1 rounded-xl border border-primary bg-primary/12 py-2 text-center text-sm font-medium text-primary">
            League
          </span>
          <span className="flex-1 rounded-xl border border-border py-2 text-center text-sm font-medium text-muted-foreground">
            Tournament
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
          {[
            ['Win', '3'],
            ['Draw', '1'],
            ['Loss', '0'],
            ['Forfeit', '-1'],
          ].map(([label, value]) => (
            <span key={label} className="rounded-xl bg-background py-2">
              {label}
              <span className="numeric block text-base font-bold text-foreground">
                {value}
              </span>
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Share the code',
    photo: 'step-share',
    body: 'Send the invite link to your club. Approve each player if you want to.',
    frame: (
      <div className="mx-auto w-fit -rotate-3 rounded-2xl bg-background px-6 py-5 text-center shadow-card">
        <p className="kicker">Invite code</p>
        <p className="display numeric text-3xl tracking-[0.2em]">KNG7Q2XR</p>
        <p className="mt-1 text-xs text-muted-foreground">Example</p>
      </div>
    ),
  },
  {
    title: 'Play your game',
    photo: 'step-play',
    body: 'On chess.com, over the board or anywhere else: whenever suits you both, before the deadline.',
    frame: (
      <MatchCard
        label={<span className="kicker">Round 1 · Example</span>}
        home={you}
        away={friend}
        score={null}
        winner={null}
        tone="live"
        status="1d 4h left"
      />
    ),
  },
  {
    title: 'Misri does the rest',
    photo: 'step-champion',
    body: 'Results land, the table moves, and the champion gets confetti.',
    frame: (
      <div className="flex flex-col items-center gap-2 py-2">
        <div className="relative">
          <PlayerAvatar username="You" className="size-16" />
          <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
            <Trophy className="size-3.5" aria-hidden />
          </span>
        </div>
        <p className="kicker">Champion</p>
        <p className="display text-xl">You won it!</p>
      </div>
    ),
  },
]

export function Steps() {
  const [active, setActive] = useState(0)
  const stopped = useMotionStopped()
  const next = () => setActive((i) => (i + 1) % STEPS.length)

  return (
    <section
      aria-labelledby="how-heading"
      className="l-reveal grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-start"
    >
      <div className="space-y-2 md:sticky md:top-20">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-foreground">
          {STEPS.map((step, i) => (
            <img
              key={step.photo}
              src={`/landing/${step.photo}.webp`}
              alt={i === active ? PHOTOS[step.photo].alt : ''}
              width={1000}
              height={1250}
              loading="lazy"
              className={cn(
                'absolute inset-0 size-full object-cover transition-[opacity,scale] duration-700 ease-out',
                i === active ? 'scale-100 opacity-100' : 'scale-105 opacity-0',
              )}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />
          <div className="absolute inset-x-4 top-4 flex gap-1.5" aria-hidden>
            {STEPS.map((step, i) => (
              <span
                key={step.title}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                {i < active && <span className="block size-full bg-white" />}
                {i === active && (
                  <span
                    key={active}
                    className="l-progress block size-full bg-white"
                    style={
                      {
                        '--clip': CLIP,
                        animationPlayState: stopped ? 'paused' : 'running',
                      } as CSSProperties
                    }
                    onAnimationEnd={next}
                  />
                )}
              </span>
            ))}
          </div>
          <div
            key={active}
            className="l-enter absolute inset-x-4 bottom-16 rounded-2xl bg-card p-4 shadow-card"
            style={{ animationDelay: '0s' }}
          >
            {STEPS[active].frame}
          </div>
          <p className="absolute inset-x-4 bottom-4 rounded-full bg-white/15 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur-md">
            Step {active + 1} of {STEPS.length} · {STEPS[active].title}
          </p>
        </div>
        <Credit photos={STEPS.map((step) => step.photo)} />
      </div>

      <div className="space-y-2">
        <p className="kicker text-primary">How it works</p>
        <h2 id="how-heading" className="mt-2 mb-6 text-5xl md:text-6xl">
          <span className="l-condensed block">From idea</span>
          <span className="l-condensed block text-primary">to champion.</span>
        </h2>
        <ol className="space-y-2">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <button
                type="button"
                aria-current={i === active ? 'step' : undefined}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className={cn(
                  'flex w-full gap-3 rounded-2xl px-3 py-3 text-left transition-colors duration-150',
                  i === active ? 'bg-card shadow-card' : 'hover:bg-card/60',
                )}
              >
                <span
                  className={cn(
                    'numeric grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors duration-150',
                    i <= active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold">{step.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {step.body}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
