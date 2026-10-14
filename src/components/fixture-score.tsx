import { cn } from '#/lib/utils'
import type { FixtureView } from '#/server/queries.server'

/**
 * The middle of a fixture line: the result once there is one, else its state.
 * Every screen that lists fixtures uses this, so a result reads the same
 * everywhere.
 */
export function FixtureScore({ fixture }: { fixture: FixtureView }) {
  const game = fixture.game
  const pill =
    'numeric shrink-0 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold'

  if (game) {
    return (
      <a
        href={game.chessComUrl}
        target="_blank"
        rel="noreferrer noopener"
        title="Open the game on chess.com"
        className={cn(pill, 'bg-primary/12 text-primary hover:bg-primary/20')}
      >
        {game.result === 'draw' ? '½–½' : game.homeWon ? '1–0' : '0–1'}
      </a>
    )
  }

  if (fixture.status === 'walkover') {
    return (
      <span
        className={cn(pill, 'bg-flame/12 text-flame')}
        title={`Walkover to ${fixture.walkoverWinner}: +3 for them, −1 for the other`}
      >
        W/O
      </span>
    )
  }

  if (fixture.status === 'expired') {
    return (
      <span
        className={cn(pill, 'bg-destructive/12 text-destructive')}
        title="Window closed unplayed — both players lost a point"
      >
        −1 / −1
      </span>
    )
  }

  return (
    <span
      className={cn(
        pill,
        'uppercase',
        fixture.status === 'live'
          ? 'bg-flame text-flame-foreground'
          : 'text-muted-foreground',
      )}
    >
      {fixture.status === 'live' ? 'Play' : 'vs'}
    </span>
  )
}

/** Whether a side of the fixture won it, by game or by walkover. */
export function wonFixture(fixture: FixtureView, side: 'home' | 'away') {
  if (fixture.game) {
    if (fixture.game.result === 'draw') return false
    return side === 'home' ? fixture.game.homeWon : !fixture.game.homeWon
  }
  return (
    fixture.status === 'walkover' && fixture.walkoverWinner === fixture[side]
  )
}
