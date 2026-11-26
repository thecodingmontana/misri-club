import type { PlayerPage } from '@misri/api-client'
import { FORMAT_LABEL, STATUS_LABEL } from '@misri/core/formats'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import {
  Avatar,
  Button,
  Card,
  PressableFeedback,
  useThemeColor,
} from 'heroui-native'
import { Text, View } from 'react-native'
import { EmptyCard } from '@/competitions'
import { Problem, Screen } from '@/components'
import { Icon } from '@/icon'
import { relativeTime } from '@/lib/format'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'
import { avatarUrl, PlayerAvatar } from '@/match'
import { RefreshScroll } from '@/refresh'
import { PlayerSkeleton } from '@/skeletons'

type Record = PlayerPage['record']
type Result = PlayerPage['recent'][number]

const OUTCOME = {
  win: { label: 'W', className: 'bg-success/15 text-foreground' },
  draw: { label: '½', className: 'bg-surface-secondary text-muted' },
  loss: { label: 'L', className: 'bg-danger/15 text-danger' },
  forfeit: { label: 'F', className: 'bg-danger/15 text-danger' },
} as const

const tally = (r: Record) => `${r.wins}–${r.draws}–${r.losses}`

/** A player: their record, their results, and how you do against them. */
export default function Player() {
  const { username } = useLocalSearchParams<{ username: string }>()
  const { api } = useSession()
  const accent = useThemeColor('accent')
  const { data, error, loading, reload } = useLoad(
    () => (api ? api.player(username) : Promise.resolve(undefined)),
    `${Boolean(api)}:${username}`,
  )

  if (error && !data) {
    return (
      <Screen>
        <Problem message={error} onRetry={reload} />
      </Screen>
    )
  }
  if (loading && !data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <PlayerSkeleton />
      </Screen>
    )
  }
  if (!data) {
    return (
      <Screen>
        <Problem message="No player by that name." onRetry={reload} />
      </Screen>
    )
  }
  const { player, record, played, headToHead, titles, competitions, recent } =
    data

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <RefreshScroll
        contentContainerClassName="gap-5 p-4 pb-10"
        onRefresh={reload}
      >
        <View className="items-center gap-2">
          <PlayerAvatar
            player={{
              name: player.name,
              chessUsername: null,
              image: player.image,
            }}
            size="lg"
          />
          <Text className="font-display text-center text-4xl uppercase text-foreground">
            {player.name}
          </Text>
          {player.chessUsername && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() =>
                WebBrowser.openBrowserAsync(
                  `https://www.chess.com/member/${encodeURIComponent(player.chessUsername as string)}`,
                )
              }
            >
              <Button.Label>chess.com profile</Button.Label>
              <Icon name="ExternalLink" size={14} />
            </Button>
          )}
        </View>

        <View className="flex-row gap-3">
          <Tile label="Record" value={tally(record)} hint="W–D–L" />
          <Tile
            label="Titles"
            value={String(titles)}
            hint={titles === 1 ? 'competition won' : 'competitions won'}
          />
          <Tile
            label={player.isYou ? 'Played' : 'You vs them'}
            value={headToHead ? tally(headToHead) : String(played)}
            hint={headToHead ? 'your W–D–L' : 'games, walkovers aside'}
          />
        </View>

        <View className="gap-3">
          <Text className="font-display text-xl uppercase text-foreground">
            Recent results
          </Text>
          {recent.length === 0 ? (
            <EmptyCard>No results yet in competitions you can see.</EmptyCard>
          ) : (
            recent.map((r) => <ResultRow key={r.matchId} result={r} />)
          )}
        </View>

        <View className="gap-3">
          <Text className="font-display text-xl uppercase text-foreground">
            Competitions
          </Text>
          {competitions.length === 0 ? (
            <EmptyCard>None you can see.</EmptyCard>
          ) : (
            competitions.map((c) => (
              <Card key={c.slug} className="p-0">
                <PressableFeedback
                  className="flex-row items-center gap-3 px-4 py-3"
                  onPress={() => router.push(`/c/${c.slug}`)}
                >
                  <View className="min-w-0 flex-1">
                    <Text
                      numberOfLines={1}
                      className="font-semibold text-sm text-foreground"
                    >
                      {c.name}
                    </Text>
                    <Text className="font-normal text-xs text-muted">
                      {FORMAT_LABEL[c.format]} · {STATUS_LABEL[c.status]}
                    </Text>
                  </View>
                  {c.won && <Icon name="Trophy" color={accent} />}
                </PressableFeedback>
              </Card>
            ))
          )}
        </View>
      </RefreshScroll>
    </Screen>
  )
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <Card className="flex-1 items-center px-2 py-3">
      <Text className="font-semibold text-2xs uppercase tracking-widest text-muted">
        {label}
      </Text>
      <Text className="font-display mt-0.5 text-2xl text-accent">{value}</Text>
      <Text className="font-normal text-center text-2xs text-muted">
        {hint}
      </Text>
    </Card>
  )
}

function ResultRow({ result }: { result: Result }) {
  const look = OUTCOME[result.outcome]
  return (
    <Card className="p-0">
      <PressableFeedback
        className="flex-row items-center gap-3 px-3 py-2.5"
        onPress={() => router.push(`/c/${result.slug}`)}
      >
        <View
          className={`size-7 items-center justify-center rounded-full ${look.className}`}
        >
          <Text
            className={`font-bold text-2xs ${look.className.split(' ')[1]}`}
          >
            {look.label}
          </Text>
        </View>
        <Avatar size="sm" alt={result.opponent}>
          <Avatar.Image
            source={{
              uri: avatarUrl(result.opponent, result.opponentImage),
            }}
          />
          <Avatar.Fallback>
            {result.opponent.slice(0, 2).toUpperCase()}
          </Avatar.Fallback>
        </Avatar>
        {/* beside the avatar: who, then which competition */}
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className="font-medium text-sm text-foreground"
          >
            {result.opponent}
          </Text>
          <Text numberOfLines={1} className="font-normal text-xs text-muted">
            {result.competition}
          </Text>
        </View>
        {result.endedAt && (
          <Text className="font-normal text-2xs text-muted">
            {relativeTime(result.endedAt)}
          </Text>
        )}
      </PressableFeedback>
    </Card>
  )
}
