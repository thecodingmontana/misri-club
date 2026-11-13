import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PlayerAvatar, PlayerChip } from '#/components/player-chip'
import { countdown, formatDate } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { FixtureView } from '#/server/queries.server'

type Winner = 'home' | 'away' | null

/**
 * Every pairing on the site — a fixture, a league game, a friendly — renders
 * as this card: each player's face and name on their side, the score (or the
 * state) in the middle, and one status line under it.
 */
export function MatchCard({
  label,
  home,
  away,
  score,
  winner,
  centre = 'vs',
  status,
  tone = 'muted',
  href,
  children,
}: {
  /** A small heading above the pairing, e.g. the matchday. */
  label?: ReactNode
  home: string
  away: string
  /** Each side's score; null while there is no result. */
  score: [string, string] | null
  winner: Winner
  /** Stands in for the score while there is none. */
  centre?: string
  status: ReactNode
  tone?: 'muted' | 'live' | 'bad'
  /** The game on chess.com, opened from the score. */
  href?: string
  children?: ReactNode
}) {
  const result = score ? (
    <span
      className={cn(
        'display numeric flex items-center gap-2 text-[1.75rem] leading-none',
        tone === 'bad' && 'text-destructive',
      )}
    >
      <span className={cn(winner === 'away' && 'text-muted-foreground/40')}>
        {score[0]}
      </span>
      <span className="text-lg text-muted-foreground/60">:</span>
      <span className={cn(winner === 'home' && 'text-muted-foreground/40')}>
        {score[1]}
      </span>
    </span>
  ) : (
    <span className="display text-xl uppercase text-muted-foreground">
      {centre}
    </span>
  )

  return (
    <div className="rounded-2xl bg-card p-3 shadow-card">
      {label && (
        <p className="kicker mb-2 text-center text-[0.6rem]">{label}</p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <Side username={home} won={winner === 'home'} />
        <div className="flex flex-col items-center gap-1.5">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              title="Open the game on chess.com"
              className="rounded-lg px-1.5 py-0.5 transition-[background-color] duration-150 hover:bg-secondary"
            >
              {result}
            </a>
          ) : (
            result
          )}
          <span
            className={cn(
              'numeric flex items-center gap-1 whitespace-nowrap text-[0.68rem]',
              tone === 'live' && 'font-semibold text-primary',
              tone === 'bad' && 'text-destructive',
              tone === 'muted' && 'text-muted-foreground',
            )}
          >
            {tone === 'live' && (
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
              />
            )}
            {status}
          </span>
        </div>
        <Side username={away} won={winner === 'away'} />
      </div>
      {children}
    </div>
  )
}

function Side({ username, won }: { username: string; won: boolean }) {
  return (
    <Link
      to="/players/$username"
      params={{ username }}
      className="group flex min-w-0 flex-col items-center gap-1.5 text-center"
    >
      <PlayerAvatar username={username} shape="tile" />
      <span
        className={cn(
          'max-w-full truncate text-[0.8rem] transition-colors group-hover:text-primary',
          won ? 'font-bold text-foreground' : 'font-medium text-foreground/85',
        )}
      >
        {username}
      </span>
    </Link>
  )
}

/** A league fixture as a match card; a bye renders as a one-player line. */
export function FixtureCard({
  fixture,
  now,
  label,
  children,
}: {
  fixture: FixtureView
  now: number
  label?: ReactNode
  children?: ReactNode
}) {
  if (fixture.bye) return <ByeCard username={fixture.bye} label={label} />
  if (!fixture.home || !fixture.away) return null

  const shared = {
    label,
    home: fixture.home,
    away: fixture.away,
    children,
  }

  if (fixture.game) {
    const { result, homeWon } = fixture.game
    return (
      <MatchCard
        {...shared}
        score={
          result === 'draw' ? ['½', '½'] : homeWon ? ['1', '0'] : ['0', '1']
        }
        winner={result === 'draw' ? null : homeWon ? 'home' : 'away'}
        status="Final"
        href={fixture.game.chessComUrl}
      />
    )
  }

  if (fixture.status === 'walkover') {
    return (
      <MatchCard
        {...shared}
        score={null}
        centre="W/O"
        winner={fixture.walkoverWinner === fixture.home ? 'home' : 'away'}
        status="Walkover · +3 / −1"
      />
    )
  }

  if (fixture.status === 'expired') {
    return (
      <MatchCard
        {...shared}
        score={['−1', '−1']}
        winner={null}
        tone="bad"
        status="Unplayed"
      />
    )
  }

  return fixture.status === 'live' ? (
    <MatchCard
      {...shared}
      score={null}
      winner={null}
      tone="live"
      status={`${countdown(fixture.dueAt - now)} left`}
    />
  ) : (
    <MatchCard
      {...shared}
      score={null}
      winner={null}
      status={`Opens ${formatDate(fixture.opensAt)}`}
    />
  )
}

/** A game between two members: white on the left, black on the right. */
export function GameCard({
  white,
  black,
  result,
  href,
  label,
  status,
}: {
  white: string
  black: string
  result: 'white' | 'black' | 'draw'
  href: string
  label?: ReactNode
  status: ReactNode
}) {
  return (
    <MatchCard
      label={label}
      home={white}
      away={black}
      score={
        result === 'draw'
          ? ['½', '½']
          : result === 'white'
            ? ['1', '0']
            : ['0', '1']
      }
      winner={result === 'draw' ? null : result === 'white' ? 'home' : 'away'}
      status={status}
      href={href}
    />
  )
}

export function ByeCard({
  username,
  label,
}: {
  username: string
  label?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-card px-3 py-2.5 shadow-card">
      <PlayerChip username={username} size="sm" muted />
      <span className="kicker">{label ? <>{label} · Bye</> : 'Bye'}</span>
    </div>
  )
}
