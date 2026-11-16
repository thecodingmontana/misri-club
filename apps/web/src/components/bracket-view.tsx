import { Trophy } from '#/components/icons'
import { displayName } from '#/components/match-card'
import { PlayerAvatar } from '#/components/player-chip'
import { bracketLayout, type Slot } from '#/lib/bracket-layout'
import { countdown, formatDate } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { MatchView, PlayerView } from '#/server/competition-view.server'

// The knockout drawn whole: columns per round, ties joined by lines that turn
// green once decided, placeholders for rounds still to come, and the champion.

/** Height of one first-round tie's cell; later rounds double it. */
const CELL = 116

function winnerOf(match: MatchView) {
  return match.bye?.id ?? match.winnerId
}

/** One game's points for a player: 1, ½, 0, or null while it's open. */
function legPoints(m: MatchView, playerId: string): number | null {
  if (m.status === 'void') return null
  if (m.result === 'draw') return 0.5
  const winner =
    m.winnerId ??
    (m.homeWon === null ? null : m.homeWon ? m.home?.id : m.away?.id)
  if (!winner) return null
  return winner === playerId ? 1 : 0
}

const halves = (n: number) => (n % 1 ? `${Math.floor(n) || ''}½` : String(n))

/**
 * A tie's state: one game (its winner), or home & away (the aggregate, with
 * a decider counted in; level and nothing open means the organiser decides).
 */
function tieOf(legs: MatchView[]) {
  const [first] = legs
  if (!first || legs.length < 2 || !first.home || !first.away) {
    return { winner: first ? winnerOf(first) : null, aggregate: null }
  }
  const total = (id: string) =>
    legs.reduce((sum, m) => sum + (legPoints(m, id) ?? 0), 0)
  const home = total(first.home.id)
  const away = total(first.away.id)
  const open = legs.some(
    (m) => m.status !== 'void' && legPoints(m, first.home?.id ?? '') === null,
  )
  const winner =
    open || home === away ? null : home > away ? first.home.id : first.away.id
  return {
    winner,
    aggregate: { [first.home.id]: home, [first.away.id]: away } as Record<
      string,
      number
    >,
  }
}

function Row({
  player,
  placeholder,
  score,
  state,
  you,
}: {
  player: PlayerView | null
  placeholder?: string
  score?: string
  state: 'won' | 'lost' | 'open'
  you: boolean
}) {
  return (
    <div
      className={cn(
        'flex h-9 items-center gap-2 px-2.5 text-sm',
        you && 'bg-primary/10',
        state === 'lost' && 'opacity-55',
      )}
    >
      {player ? (
        <>
          <PlayerAvatar
            username={displayName(player)}
            image={player.image}
            className="size-6"
          />
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              state === 'won' ? 'font-bold' : 'font-medium',
            )}
          >
            {displayName(player)}
            {you && <span className="text-muted-foreground"> (you)</span>}
          </span>
          {score && (
            <span
              className={cn(
                'numeric shrink-0 text-xs font-bold',
                state === 'won' ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {score}
            </span>
          )}
        </>
      ) : (
        <span className="truncate text-xs text-muted-foreground italic">
          {placeholder}
        </span>
      )}
    </div>
  )
}

function caption(match: MatchView | null, now: number) {
  if (!match) return 'To be decided'
  if (match.bye) return 'Bye, goes through'
  switch (match.status) {
    case 'played':
      return 'Final · chess.com'
    case 'walkover':
      return 'Walkover'
    case 'live':
      return `${countdown(match.dueAt - now)} left`
    case 'upcoming':
      return `Opens ${formatDate(match.opensAt)}`
    case 'expired':
      return 'Unplayed'
    default:
      return ''
  }
}

/** Home & away: which leg is on, or the decider. */
function legCaption(legs: MatchView[], now: number) {
  const next = legs.find((m) =>
    ['live', 'upcoming', 'expired'].includes(m.status),
  )
  if (!next) return 'Aggregate'
  const name = (next.leg ?? 1) >= 3 ? 'Decider' : `Leg ${next.leg} of 2`
  return `${name} · ${caption(next, now)}`
}

function TieCard({
  slot,
  viewerId,
  now,
}: {
  slot: Slot<MatchView>
  viewerId: string | null
  now: number
}) {
  const match = slot.match
  const tie = tieOf(slot.legs)
  const decided = tie.winner
  const played = slot.legs.some((m) =>
    ['played', 'walkover'].includes(m.status),
  )
  const scoreFor = (player: PlayerView | null) => {
    // home & away: the running aggregate
    if (tie.aggregate && player && played)
      return halves(tie.aggregate[player.id] ?? 0)
    // a bye is a pass, not a game: no score
    if (!match || match.bye || !player || !decided) return undefined
    if (match.status === 'walkover') return decided === player.id ? 'W/O' : ''
    if (match.result === 'draw') return '½'
    return decided === player.id ? '1' : '0'
  }
  const stateFor = (player: PlayerView | null) =>
    !decided || !player ? 'open' : decided === player.id ? 'won' : 'lost'
  const [a, b] = slot.feeds ?? [0, 0]
  const top = match?.bye ?? match?.home ?? null
  const bottom = match?.bye ? null : (match?.away ?? null)

  return (
    <div className="w-full">
      <p className="mb-1 flex justify-between px-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        <span>Match {slot.number}</span>
        <span
          className={cn(
            'truncate pl-2 normal-case',
            match?.status === 'live' && 'text-primary',
          )}
        >
          {slot.legs.length > 1
            ? legCaption(slot.legs, now)
            : caption(match, now)}
        </span>
      </p>
      <div
        className={cn(
          'divide-y divide-border overflow-hidden rounded-xl',
          match ? 'bg-card shadow-card' : 'border border-dashed border-border',
          match?.status === 'live' && 'ring-1 ring-primary/40',
        )}
      >
        <Row
          player={top}
          placeholder={slot.feeds ? `Winner of match ${a}` : 'Waiting'}
          score={scoreFor(top)}
          state={stateFor(top)}
          you={Boolean(viewerId && top?.id === viewerId)}
        />
        {match?.bye ? (
          <div className="flex h-9 items-center px-2.5 text-xs text-muted-foreground italic">
            Bye
          </div>
        ) : (
          <Row
            player={bottom}
            placeholder={slot.feeds ? `Winner of match ${b}` : 'Waiting'}
            score={scoreFor(bottom)}
            state={stateFor(bottom)}
            you={Boolean(viewerId && bottom?.id === viewerId)}
          />
        )}
      </div>
    </div>
  )
}

export function BracketView({
  matches,
  viewerId,
  champion,
}: {
  matches: MatchView[]
  viewerId: string | null
  champion: PlayerView | null
}) {
  const rounds = bracketLayout(matches)
  // Read once per render; good enough for "2d 4h left" labels.
  const now = Date.now()
  const height = (rounds[0]?.slots.length ?? 0) * CELL

  return (
    <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-3">
      <div className="flex w-max snap-x gap-8">
        {rounds.map((round, r) => {
          const last = r === rounds.length - 1
          return (
            <section
              key={round.round}
              aria-label={round.name}
              className="w-56 shrink-0 snap-start"
            >
              <header className="mb-3 border-b border-border pb-2">
                <h3 className="text-sm font-semibold">{round.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {round.dueAt
                    ? `Due ${formatDate(round.dueAt)}`
                    : 'After the round before'}
                </p>
              </header>
              <ol className="flex flex-col" style={{ height }}>
                {round.slots.map((slot, i) => {
                  const done = Boolean(tieOf(slot.legs).winner)
                  const line = done ? 'border-primary' : 'border-border'
                  return (
                    <li
                      key={slot.number}
                      className="relative flex flex-1 items-center"
                    >
                      {/* in from the round before */}
                      {r > 0 && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute top-1/2 -left-4 w-4 border-t',
                            slot.match ? 'border-primary/60' : 'border-border',
                          )}
                        />
                      )}
                      <TieCard slot={slot} viewerId={viewerId} now={now} />
                      {/* out to the next round: a stub, then half the joiner */}
                      <span
                        aria-hidden
                        className={cn(
                          'absolute top-1/2 -right-4 w-4 border-t',
                          line,
                        )}
                      />
                      {!last && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute -right-4 border-r',
                            line,
                            i % 2 === 0
                              ? 'top-1/2 bottom-0'
                              : 'top-0 bottom-1/2',
                          )}
                        />
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
        <section aria-label="Champion" className="w-48 shrink-0 snap-start">
          <header className="mb-3 border-b border-border pb-2">
            <h3 className="text-sm font-semibold">Champion</h3>
            <p className="text-xs text-muted-foreground">
              {champion ? 'Won the final' : 'Winner of the final'}
            </p>
          </header>
          <div className="relative flex items-center" style={{ height }}>
            <span
              aria-hidden
              className="absolute top-1/2 -left-4 w-4 border-t border-border"
            />
            <div
              className={cn(
                'flex w-full items-center gap-3 rounded-xl p-3',
                champion
                  ? 'l-board text-background shadow-card'
                  : 'border border-dashed border-border',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full',
                  champion
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                <Trophy className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 truncate text-sm font-bold">
                {champion ? displayName(champion) : 'To be decided'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
