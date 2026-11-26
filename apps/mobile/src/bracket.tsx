import {
  bracketLayout,
  halves,
  type Slot,
  tieOf,
} from '@misri/core/bracket-layout'
import { Card, useThemeColor } from 'heroui-native'
import { ScrollView, Text, View } from 'react-native'
import { Icon } from '@/icon'
import { countdown, formatDate } from '@/lib/format'
import {
  displayName,
  type MatchView,
  PlayerAvatar,
  type PlayerView,
} from '@/match'

/**
 * The knockout drawn whole, as on the website: a column per round, ties joined
 * by lines that turn green once decided, placeholders for rounds to come, and
 * the champion. Scrolls sideways.
 */

/** Height of one first-round tie's cell; later rounds double it. */
const CELL = 116
const COLUMN = 208
const GAP = 28

function caption(match: MatchView | null, now: number) {
  if (!match) return 'To be decided'
  if (match.bye) return 'Bye, goes through'
  switch (match.status) {
    case 'played':
      return 'Final'
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

function Row({
  player,
  placeholder,
  score,
  state,
  you,
}: {
  player: PlayerView | null
  placeholder: string
  score?: string
  state: 'won' | 'lost' | 'open'
  you: boolean
}) {
  return (
    <View
      className={`h-10 flex-row items-center gap-2 px-2.5 ${you ? 'bg-accent/10' : ''} ${state === 'lost' ? 'opacity-55' : ''}`}
    >
      {player ? (
        <>
          <PlayerAvatar player={player} size="sm" />
          <Text
            numberOfLines={1}
            className={`flex-1 text-sm text-foreground ${state === 'won' ? 'font-bold' : 'font-medium'}`}
          >
            {displayName(player)}
            {you && <Text className="text-muted"> (you)</Text>}
          </Text>
          {score !== undefined && (
            <Text
              className={`font-bold text-xs ${state === 'won' ? 'text-accent' : 'text-muted'}`}
            >
              {score}
            </Text>
          )}
        </>
      ) : (
        <Text
          numberOfLines={1}
          className="font-normal text-xs italic text-muted"
        >
          {placeholder}
        </Text>
      )}
    </View>
  )
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
    if (tie.aggregate && player && played)
      return halves(tie.aggregate[player.id] ?? 0)
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
  const live = match?.status === 'live'

  return (
    <View className="w-full gap-1">
      <View className="flex-row justify-between px-1">
        <Text className="font-semibold text-[10px] uppercase tracking-widest text-muted">
          Match {slot.number}
        </Text>
        <Text
          numberOfLines={1}
          className={`shrink pl-2 font-semibold text-[10px] ${live ? 'text-accent' : 'text-muted'}`}
        >
          {slot.legs.length > 1
            ? legCaption(slot.legs, now)
            : caption(match, now)}
        </Text>
      </View>
      <Card
        className={`overflow-hidden p-0 ${match ? '' : 'border border-dashed border-border bg-transparent'} ${live ? 'border border-accent/40' : ''}`}
      >
        <Row
          player={top}
          placeholder={slot.feeds ? `Winner of match ${a}` : 'Waiting'}
          score={scoreFor(top)}
          state={stateFor(top)}
          you={Boolean(viewerId && top?.id === viewerId)}
        />
        <View className="h-px bg-border" />
        {match?.bye ? (
          <View className="h-10 justify-center px-2.5">
            <Text className="font-normal text-xs italic text-muted">Bye</Text>
          </View>
        ) : (
          <Row
            player={bottom}
            placeholder={slot.feeds ? `Winner of match ${b}` : 'Waiting'}
            score={scoreFor(bottom)}
            state={stateFor(bottom)}
            you={Boolean(viewerId && bottom?.id === viewerId)}
          />
        )}
      </Card>
    </View>
  )
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <View className="mb-3 border-b border-border pb-2">
      <Text className="font-semibold text-sm text-foreground">{title}</Text>
      <Text className="font-normal text-xs text-muted">{sub}</Text>
    </View>
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
  const [accent, border] = useThemeColor(['accent', 'border'])
  const rounds = bracketLayout(matches)
  const now = Date.now()
  const height = (rounds[0]?.slots.length ?? 0) * CELL
  const half = GAP / 2

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: GAP, paddingRight: 16 }}
    >
      {rounds.map((round, r) => {
        const last = r === rounds.length - 1
        return (
          <View key={round.round} style={{ width: COLUMN }}>
            <Header
              title={round.name}
              sub={
                round.dueAt
                  ? `Due ${formatDate(round.dueAt)}`
                  : 'After the round before'
              }
            />
            <View style={{ height }}>
              {round.slots.map((slot, i) => {
                const line = tieOf(slot.legs).winner ? accent : border
                return (
                  <View
                    key={slot.number}
                    className="flex-1 justify-center"
                    style={{ position: 'relative' }}
                  >
                    {/* in from the round before */}
                    {r > 0 && (
                      <View
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: -half,
                          width: half,
                          borderTopWidth: 1,
                          borderColor: slot.match ? accent : border,
                        }}
                      />
                    )}
                    <TieCard slot={slot} viewerId={viewerId} now={now} />
                    {/* out to the next round: a stub, then half the joiner */}
                    <View
                      style={{
                        position: 'absolute',
                        top: '50%',
                        right: -half,
                        width: half,
                        borderTopWidth: 1,
                        borderColor: line,
                      }}
                    />
                    {!last && (
                      <View
                        style={{
                          position: 'absolute',
                          right: -half,
                          borderRightWidth: 1,
                          borderColor: line,
                          ...(i % 2 === 0
                            ? { top: '50%', bottom: 0 }
                            : { top: 0, bottom: '50%' }),
                        }}
                      />
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        )
      })}
      <View style={{ width: 180 }}>
        <Header
          title="Champion"
          sub={champion ? 'Won the final' : 'Winner of the final'}
        />
        <View className="justify-center" style={{ height }}>
          <View
            style={{
              position: 'absolute',
              top: '50%',
              left: -half,
              width: half,
              borderTopWidth: 1,
              borderColor: border,
            }}
          />
          <Card
            className={`flex-row items-center gap-3 p-3 ${champion ? 'bg-accent' : 'border border-dashed border-border bg-transparent'}`}
          >
            <View
              className={`size-9 items-center justify-center rounded-full ${champion ? 'bg-background/20' : 'bg-default'}`}
            >
              <Icon
                name="Trophy"
                size={16}
                color={champion ? '#fff' : accent}
              />
            </View>
            <Text
              numberOfLines={1}
              className={`flex-1 font-bold text-sm ${champion ? 'text-accent-foreground' : 'text-foreground'}`}
            >
              {champion ? displayName(champion) : 'To be decided'}
            </Text>
          </Card>
        </View>
      </View>
    </ScrollView>
  )
}
