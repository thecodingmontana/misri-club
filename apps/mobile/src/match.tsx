import type { CompetitionPage } from '@misri/api-client'
import { CONCEDED } from '@misri/core/decisions'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import {
  Avatar,
  Button,
  Card,
  Dialog,
  PressableFeedback,
  Spinner,
} from 'heroui-native'
import { type ReactNode, useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { FormError } from '@/auth-shell'
import { Choice } from '@/form'
import { countdown, formatDate } from '@/lib/format'
import { sendOrQueue } from '@/lib/outbox'
import { useSession } from '@/lib/session'
import { play } from '@/lib/sound'

export type MatchView = CompetitionPage['matches'][number]
export type PlayerView = NonNullable<MatchView['home']>

/** The name shown for a player everywhere: their chess.com username. */
export const displayName = (
  player: Pick<PlayerView, 'chessUsername' | 'name'>,
) => player.chessUsername ?? player.name

/** The website's faces: their picture, else a DiceBear portrait from their name. */
export function avatarUrl(username: string, image?: string | null) {
  if (image) return image
  const seed = encodeURIComponent(username.toLowerCase())
  return `https://api.dicebear.com/9.x/notionists/png?seed=${seed}&backgroundColor=b9e4c9,ffdfbf,d6ecd2,ffd5c2,c6e6e0`
}

export function PlayerAvatar({
  player,
  size = 'md',
}: {
  player: Pick<PlayerView, 'chessUsername' | 'name' | 'image'>
  size?: 'sm' | 'md' | 'lg'
}) {
  const name = displayName(player)
  return (
    <Avatar size={size} alt={name}>
      <Avatar.Image source={{ uri: avatarUrl(name, player.image) }} />
      <Avatar.Fallback>{name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
    </Avatar>
  )
}

/** A face and name, pressing through to the player's page. */
export function PlayerChip({
  player,
  size = 'sm',
  muted,
}: {
  player: PlayerView
  size?: 'sm' | 'md'
  muted?: boolean
}) {
  return (
    <PressableFeedback
      className="min-w-0 flex-1 flex-row items-center gap-2"
      onPress={() => router.push(`/p/${player.chessUsername ?? player.id}`)}
      accessibilityRole="link"
    >
      <PlayerAvatar player={player} size={size} />
      <Text
        numberOfLines={1}
        className={`flex-1 font-medium text-sm ${muted ? 'text-muted' : 'text-foreground'}`}
      >
        {displayName(player)}
      </Text>
    </PressableFeedback>
  )
}

type Winner = 'home' | 'away' | null

/** The website's match card: faces either side, score or state in the middle. */
function MatchCard({
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
  home: PlayerView
  away: PlayerView
  score: [string, string] | null
  winner: Winner
  centre?: string
  status: string
  tone?: 'muted' | 'live' | 'bad'
  href?: string
  children?: ReactNode
}) {
  const result = score ? (
    <Text
      className={`font-display text-3xl ${tone === 'bad' ? 'text-danger' : 'text-foreground'}`}
    >
      <Text className={winner === 'away' ? 'text-muted' : undefined}>
        {score[0]}
      </Text>
      <Text className="text-lg text-muted"> : </Text>
      <Text className={winner === 'home' ? 'text-muted' : undefined}>
        {score[1]}
      </Text>
    </Text>
  ) : (
    <Text className="font-display text-xl uppercase text-muted">{centre}</Text>
  )
  return (
    <Card className="p-3">
      <View className="flex-row items-center gap-2">
        <Side player={home} won={winner === 'home'} />
        <View className="items-center gap-1">
          {href ? (
            <PressableFeedback
              onPress={() => WebBrowser.openBrowserAsync(href)}
              accessibilityLabel="Open the game on chess.com"
            >
              {result}
            </PressableFeedback>
          ) : (
            result
          )}
          <View className="flex-row items-center gap-1">
            {tone === 'live' && (
              <View className="size-1.5 rounded-full bg-accent" />
            )}
            <Text
              className={`font-medium text-2xs ${
                tone === 'live'
                  ? 'font-semibold text-accent'
                  : tone === 'bad'
                    ? 'text-danger'
                    : 'text-muted'
              }`}
            >
              {status}
            </Text>
          </View>
        </View>
        <Side player={away} won={winner === 'away'} />
      </View>
      {children}
    </Card>
  )
}

function Side({ player, won }: { player: PlayerView; won: boolean }) {
  return (
    <PressableFeedback
      className="min-w-0 flex-1 items-center gap-1.5"
      onPress={() => router.push(`/p/${player.chessUsername ?? player.id}`)}
    >
      <PlayerAvatar player={player} />
      <Text
        numberOfLines={1}
        className={`text-sm ${won ? 'font-bold text-foreground' : 'font-medium text-foreground/85'}`}
      >
        {displayName(player)}
      </Text>
    </PressableFeedback>
  )
}

/** A match as a card; a bye as a one-player line. */
export function FixtureCard({
  match,
  now,
  children,
}: {
  match: MatchView
  now: number
  children?: ReactNode
}) {
  if (match.bye) {
    return (
      <Card className="flex-row items-center justify-between px-3 py-2.5">
        <PlayerChip player={match.bye} muted />
        <Text className="font-semibold text-xs uppercase tracking-widest text-muted">
          Bye
        </Text>
      </Card>
    )
  }
  if (!match.home || !match.away) return null
  const shared = {
    home: match.home,
    away: match.away,
    children: (
      <>
        {match.note && (
          <Text className="font-normal mt-1.5 text-xs text-muted">
            {match.note === CONCEDED ? match.note : `Organiser: ${match.note}`}
          </Text>
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

/** "Are you sure?" with HeroUI's Dialog; the action's error shows inside it. */
export function Confirm({
  trigger,
  title,
  description,
  confirmLabel,
  danger,
  isDisabled,
  children,
  onConfirm,
}: {
  trigger: (open: () => void) => ReactNode
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  /** e.g. until the name is typed */
  isDisabled?: boolean
  /** a field inside the dialog */
  children?: ReactNode
  onConfirm: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog isOpen={open} onOpenChange={setOpen}>
      {trigger(() => {
        setError(null)
        setOpen(true)
      })}
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <View className="mb-5 gap-1.5">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
          </View>
          {children}
          <FormError message={error} />
          <View className="mt-3 flex-row justify-end gap-3">
            <Button variant="ghost" size="sm" onPress={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={danger ? 'danger' : 'primary'}
              isDisabled={busy || isDisabled}
              onPress={async () => {
                setBusy(true)
                setError(null)
                try {
                  await onConfirm()
                  play('success')
                  setOpen(false)
                } catch (cause) {
                  setError((cause as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? (
                <Spinner size="sm" />
              ) : (
                <Button.Label>{confirmLabel}</Button.Label>
              )}
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}

/**
 * For a game chess.com won't show: one player reports it, the other confirms
 * it, and it counts. A dispute goes to the organiser.
 */
export function MatchReport({
  slug,
  match,
  viewerId,
  primary,
  onDone,
}: {
  slug: string
  match: MatchView
  viewerId: string | null
  primary: boolean
  onDone: () => void
}) {
  const { home, away, report } = match
  if (!home || !away) return null
  if (match.status !== 'live' && match.status !== 'expired') return null
  const isPlayer = viewerId === home.id || viewerId === away.id

  if (report) {
    const winner =
      report.result === 'draw'
        ? null
        : (report.result === 'white') === report.homeWhite
          ? home
          : away
    const by = report.byUserId === home.id ? home : away
    const other = by === home ? away : home
    const said = `${displayName(by)} says ${
      !winner
        ? 'it was a draw'
        : winner === by
          ? 'they won'
          : `${displayName(winner)} won`
    }.`
    return (
      <View className="mt-2 gap-2 rounded-2xl bg-surface-secondary px-3 py-2">
        <Text className="font-normal text-center text-xs text-foreground">
          {said}{' '}
          {viewerId === other.id
            ? 'Is that right?'
            : `Waiting for ${displayName(other)} to confirm.`}
        </Text>
        {viewerId === other.id && (
          <Answer
            slug={slug}
            matchId={match.id}
            seen={report}
            onDone={onDone}
          />
        )}
      </View>
    )
  }
  return isPlayer ? (
    <ReportForm
      slug={slug}
      matchId={match.id}
      primary={primary}
      onDone={onDone}
    />
  ) : null
}

function Answer({
  slug,
  matchId,
  seen,
  onDone,
}: {
  slug: string
  matchId: string
  seen: { result: 'white' | 'black' | 'draw'; homeWhite: boolean }
  onDone: () => void
}) {
  const { api } = useSession()
  const [busy, setBusy] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const send = async (accept: boolean) => {
    if (!api) return
    setBusy(accept)
    setError(null)
    try {
      const sent = await sendOrQueue(api, 'answerReport', {
        slug,
        matchId,
        accept,
        seen: { result: seen.result, homeWhite: seen.homeWhite },
      })
      if (sent === 'queued')
        Alert.alert('Saved offline', "It sends when you're back online.")
      play('success')
      onDone()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <Button
          size="sm"
          className="flex-1"
          isDisabled={busy !== null}
          onPress={() => send(true)}
        >
          {busy === true ? (
            <Spinner size="sm" />
          ) : (
            <Button.Label>Confirm</Button.Label>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          isDisabled={busy !== null}
          onPress={() => send(false)}
        >
          {busy === false ? (
            <Spinner size="sm" />
          ) : (
            <Button.Label>Dispute</Button.Label>
          )}
        </Button>
      </View>
      <FormError message={error} />
    </View>
  )
}

function ReportForm({
  slug,
  matchId,
  primary,
  onDone,
}: {
  slug: string
  matchId: string
  primary: boolean
  onDone: () => void
}) {
  const { api } = useSession()
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<'win' | 'draw' | 'loss'>('win')
  const [white, setWhite] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <Button
        variant={primary ? 'secondary' : 'ghost'}
        size="sm"
        className="mt-2"
        onPress={() => setOpen(true)}
      >
        {primary
          ? 'Report the result'
          : 'Played somewhere else? Report the result'}
      </Button>
    )
  }
  return (
    <View className="mt-2 gap-3 rounded-2xl bg-surface-secondary p-3">
      <Choice
        label="How did it go?"
        value={outcome}
        onChange={setOutcome}
        options={[
          { value: 'win', label: 'I won' },
          { value: 'draw', label: 'Draw' },
          { value: 'loss', label: 'I lost' },
        ]}
      />
      <Choice
        label="You played"
        value={white ? 'white' : 'black'}
        onChange={(value) => setWhite(value === 'white')}
        options={[
          { value: 'white', label: 'White' },
          { value: 'black', label: 'Black' },
        ]}
      />
      <FormError message={error} />
      <View className="flex-row gap-2">
        <Button
          size="sm"
          className="flex-1"
          isDisabled={busy}
          onPress={async () => {
            if (!api) return
            setBusy(true)
            setError(null)
            try {
              const sent = await sendOrQueue(api, 'reportResult', {
                slug,
                matchId,
                outcome,
                white,
              })
              if (sent === 'queued')
                Alert.alert(
                  'Saved offline',
                  "It sends when you're back online.",
                )
              play('success')
              setOpen(false)
              onDone()
            } catch (cause) {
              setError((cause as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? <Spinner size="sm" /> : <Button.Label>Report</Button.Label>}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onPress={() => setOpen(false)}
        >
          Cancel
        </Button>
      </View>
    </View>
  )
}
