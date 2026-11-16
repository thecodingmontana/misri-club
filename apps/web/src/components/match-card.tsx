import type { ReactNode } from 'react'
import { PlayerAvatar, PlayerChip } from '#/components/player-chip'
import { countdown, formatDate } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { MatchView, PlayerView } from '#/server/competition-view.server'

type Winner = 'home' | 'away' | null

/** The name shown for a player everywhere: their chess.com username. */
export const displayName = (player: PlayerView) =>
  player.chessUsername ?? player.name

/**
 * Every pairing on the site renders as this card: each player's face and name
 * on their side, the score (or the state) in the middle, and one status line
 * under it.
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
  /** A small heading above the pairing, e.g. the round. */
  label?: ReactNode
  home: PlayerView
  away: PlayerView
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
        <Side player={home} won={winner === 'home'} />
        <div className="flex flex-col items-center gap-1.5">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              data-tip="Open the game on chess.com"
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
        <Side player={away} won={winner === 'away'} />
      </div>
      {children}
    </div>
  )
}

function Side({ player, won }: { player: PlayerView; won: boolean }) {
  const name = displayName(player)
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <PlayerAvatar username={name} image={player.image} shape="tile" />
      <span
        className={cn(
          'max-w-full truncate text-[0.8rem]',
          won ? 'font-bold text-foreground' : 'font-medium text-foreground/85',
        )}
      >
        {name}
      </span>
    </div>
  )
}

/** A match as a card; a bye renders as a one-player line. */
export function FixtureCard({
  match,
  now,
  label,
  children,
}: {
  match: MatchView
  now: number
  label?: ReactNode
  children?: ReactNode
}) {
  if (match.bye) return <ByeCard player={match.bye} label={label} />
  if (!match.home || !match.away) return null

  const shared = {
    label,
    home: match.home,
    away: match.away,
    children: (
      <>
        {match.note && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Organiser: {match.note}
          </p>
        )}
        {children}
      </>
    ),
  }

  if (match.status === 'void') {
    return (
      <MatchCard {...shared} score={null} winner={null} status="Called off" />
    )
  }

  if (match.status === 'played') {
    const { result, homeWon } = match
    return (
      <MatchCard
        {...shared}
        score={
          result === 'draw' ? ['½', '½'] : homeWon ? ['1', '0'] : ['0', '1']
        }
        winner={result === 'draw' ? null : homeWon ? 'home' : 'away'}
        status="Final"
        href={match.gameUrl ?? undefined}
      />
    )
  }

  if (match.status === 'walkover') {
    return (
      <MatchCard
        {...shared}
        score={null}
        centre="W/O"
        winner={match.winnerId === match.home.id ? 'home' : 'away'}
        status="Walkover"
      />
    )
  }

  if (match.status === 'expired') {
    return (
      <MatchCard
        {...shared}
        score={null}
        centre="vs"
        winner={null}
        tone="bad"
        status="Unplayed"
      />
    )
  }

  return match.status === 'live' ? (
    <MatchCard
      {...shared}
      score={null}
      winner={null}
      tone="live"
      status={`${countdown(match.dueAt - now)} left`}
    />
  ) : (
    <MatchCard
      {...shared}
      score={null}
      winner={null}
      status={`Opens ${formatDate(match.opensAt)}`}
    />
  )
}

export function ByeCard({
  player,
  label,
}: {
  player: PlayerView
  label?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-card px-3 py-2.5 shadow-card">
      <PlayerChip
        username={displayName(player)}
        image={player.image}
        size="sm"
        muted
      />
      <span className="kicker">{label ? <>{label} · Bye</> : 'Bye'}</span>
    </div>
  )
}
