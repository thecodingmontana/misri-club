import { Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { Check } from '#/components/icons'
import { MatchCard } from '#/components/match-card'
import { Button } from '#/components/ui/button'
import { Credit } from './format-cards'
import { LeagueDemo } from './league-demo'
import { Lede } from './words'

const you = { id: 'you', name: 'You', image: null, chessUsername: null }
const amina = { id: 'amina', name: 'Amina', image: null, chessUsername: null }
const brian = { id: 'brian', name: 'Brian', image: null, chessUsername: null }

/** The page's one focal point: what Misri is, and the product doing it. */
export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative">
      <div className="mx-auto max-w-5xl px-4 pt-10 md:pt-16">
        <p
          className="l-enter kicker text-primary"
          style={{ '--i': 0 } as CSSProperties}
        >
          Chess leagues for your club
        </p>
        <h1 className="mt-3 text-[3.4rem] sm:text-7xl lg:text-[6.5rem]">
          {[
            ['Run the league.', 'text-foreground'],
            ['We keep the score.', 'text-primary'],
          ].map(([line, tone], i) => (
            <span key={line} className="block overflow-hidden">
              <span
                className={`l-enter l-condensed block ${tone}`}
                style={{ '--i': i + 1 } as CSSProperties}
              >
                {line}
              </span>
            </span>
          ))}
        </h1>
        <div className="mt-6 grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-end">
          <Lede
            className="max-w-prose text-lg text-pretty text-muted-foreground"
            text="Create a league or a knockout, invite your club with a code, and play on chess.com or over the board. Misri **reads chess.com results by itself**, players confirm the rest, and it **keeps the table**, so the group chat can talk about chess again."
          />
          <div
            className="l-enter space-y-3 md:justify-self-end"
            style={{ '--i': 9 } as CSSProperties}
          >
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild size="lg" className="rounded-xl px-6">
                {signedIn ? (
                  <Link to="/">Open Misri</Link>
                ) : (
                  <Link
                    to="/auth/signin"
                    search={{ redirect: '/competitions/new?format=league' }}
                  >
                    Start a league
                  </Link>
                )}
              </Button>
              <Link
                to="/join"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                I have an invite code
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {[
                'Free',
                'chess.com or over the board',
                'Leagues and knockouts',
              ].map((point) => (
                <li key={point} className="flex items-center gap-1">
                  <Check className="size-3.5 text-primary" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* the product, framed, over a real club scene fading into the page */}
      <div className="relative mt-12 md:mt-16">
        <img
          src="/landing/hero-players.webp"
          alt=""
          width={1600}
          height={1068}
          fetchPriority="high"
          className="absolute inset-x-0 bottom-0 h-[78%] w-full object-cover opacity-70 [mask-image:linear-gradient(transparent,#000_35%)] dark:opacity-40"
        />
        <div
          className="l-enter relative mx-auto max-w-5xl px-4 pb-14"
          style={{ '--i': 6 } as CSSProperties}
        >
          <div className="overflow-hidden rounded-[1.75rem] border border-border bg-background shadow-[0_30px_80px_-30px_rgb(31_77_58/0.45)]">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-[#ef6f5e]" />
                <span className="size-2.5 rounded-full bg-[#f2b632]" />
                <span className="size-2.5 rounded-full bg-primary" />
              </span>
              <span className="mx-auto rounded-full bg-secondary px-3 py-0.5 text-[11px] text-muted-foreground">
                misri-chess-club.vercel.app/c/friday-league
              </span>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_1.1fr] md:p-6">
              <LeagueDemo />
              <div className="hidden space-y-2 md:block">
                <p className="kicker">Fixtures · Example</p>
                <MatchCard
                  home={you}
                  away={amina}
                  score={null}
                  winner={null}
                  tone="live"
                  status="1d 4h left"
                />
                <MatchCard
                  home={brian}
                  away={you}
                  score={['½', '½']}
                  winner={null}
                  status="Final · from chess.com"
                />
              </div>
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <Credit photos={['hero-players']} />
          </div>
        </div>
      </div>
    </section>
  )
}
