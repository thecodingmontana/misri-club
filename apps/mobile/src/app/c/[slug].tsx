import type { CompetitionPage } from '@misri/api-client'
import { Stack, useLocalSearchParams } from 'expo-router'
import { Card, Chip } from 'heroui-native'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { Loading, Problem, Screen } from '@/components'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'

type Player = { name: string; chessUsername: string | null } | null
type Match = CompetitionPage['matches'][number]

const shown = (p: Player) => (p ? (p.chessUsername ?? p.name) : 'TBD')

const STATUS: Record<
  string,
  {
    label: string
    color: 'accent' | 'default' | 'success' | 'warning' | 'danger'
  }
> = {
  played: { label: 'Played', color: 'success' },
  walkover: { label: 'Walkover', color: 'default' },
  upcoming: { label: 'Upcoming', color: 'default' },
  live: { label: 'Open now', color: 'accent' },
  expired: { label: 'Past deadline', color: 'warning' },
  bye: { label: 'Bye', color: 'default' },
  void: { label: 'Called off', color: 'danger' },
}

function score(m: Match) {
  if (m.result === 'draw') return '½ – ½'
  if (m.homeWon === true) return '1 – 0'
  if (m.homeWon === false) return '0 – 1'
  return 'vs'
}

export default function Competition() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { api } = useSession()
  const { data, error, loading, reload } = useLoad(
    () => (api ? api.competition(slug) : Promise.resolve(null)),
    `${Boolean(api)}:${slug}`,
  )

  if (error && !data) {
    return (
      <Screen>
        <Problem message={error} onRetry={reload} />
      </Screen>
    )
  }
  if (!data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }

  const rounds = new Map<number, Match[]>()
  for (const m of data.matches) {
    rounds.set(m.round, [...(rounds.get(m.round) ?? []), m])
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: data.competition.name }} />
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} />
        }
      >
        <Text className="text-2xl font-bold text-foreground">
          {data.competition.name}
        </Text>
        <Text className="font-normal text-sm text-muted">
          {data.playerCount} {data.playerCount === 1 ? 'player' : 'players'}
        </Text>

        {!data.canSeeDetails && (
          <Card>
            <Card.Body>
              <Card.Description>
                Join this competition on the website to see its games.
              </Card.Description>
            </Card.Body>
          </Card>
        )}

        {data.standings && data.standings.length > 0 && (
          <Card>
            <Card.Body>
              <Card.Title>Table</Card.Title>
              <Row cells={['#', 'Player', 'W', 'D', 'L', 'Pts']} head />
              {data.standings.map((row, i) => (
                <Row
                  key={row.player.id}
                  cells={[
                    String(i + 1),
                    shown(row.player),
                    String(row.wins),
                    String(row.draws),
                    String(row.losses),
                    String(row.points),
                  ]}
                />
              ))}
            </Card.Body>
          </Card>
        )}

        {[...rounds.entries()].map(([round, matches]) => (
          <Card key={round}>
            <Card.Body className="gap-3">
              <Card.Title>{`Round ${round}`}</Card.Title>
              {matches.map((m) => {
                const status = STATUS[m.status] ?? {
                  label: m.status,
                  color: 'default' as const,
                }
                return (
                  <View key={m.id} className="gap-1">
                    <Text className="text-base font-medium text-foreground">
                      {m.bye
                        ? `${shown(m.bye)} has a bye`
                        : `${shown(m.home)}  ${score(m)}  ${shown(m.away)}`}
                    </Text>
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Chip size="sm" variant="soft" color={status.color}>
                        {status.label}
                      </Chip>
                      {(m.status === 'live' || m.status === 'upcoming') && (
                        <Text className="font-normal text-xs text-muted">
                          Due {new Date(m.dueAt).toLocaleDateString()}
                        </Text>
                      )}
                      {m.report && (
                        <Text className="font-normal text-xs text-muted">
                          Result reported, waiting to confirm
                        </Text>
                      )}
                    </View>
                  </View>
                )
              })}
            </Card.Body>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  )
}

function Row({ cells, head }: { cells: string[]; head?: boolean }) {
  return (
    <View className="flex-row border-b border-border py-2">
      {cells.map((cell, i) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
          key={i}
          numberOfLines={1}
          className={`${i === 1 ? 'flex-1' : 'w-9 text-center'} ${
            head ? 'font-semibold text-muted' : 'font-normal text-foreground'
          }`}
        >
          {cell}
        </Text>
      ))}
    </View>
  )
}
