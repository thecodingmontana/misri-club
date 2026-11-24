import type { CompetitionPage } from '@misri/api-client'
import { Stack, useLocalSearchParams } from 'expo-router'
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Card, Loading, Muted, Problem, Screen, Title } from '@/components'
import { useSession } from '@/lib/session'
import { type Colors, useColors } from '@/lib/theme'
import { useLoad } from '@/lib/use-load'

type Player = { name: string; chessUsername: string | null } | null
type Match = CompetitionPage['matches'][number]

const shown = (p: Player) => (p ? (p.chessUsername ?? p.name) : 'TBD')

const STATUS: Record<string, string> = {
  played: 'Played',
  walkover: 'Walkover',
  upcoming: 'Upcoming',
  live: 'Open now',
  expired: 'Past deadline',
  bye: 'Bye',
  void: 'Called off',
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
  const c = useColors()
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
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} />
        }
      >
        <Title>{data.competition.name}</Title>
        <Muted>
          {data.playerCount} {data.playerCount === 1 ? 'player' : 'players'}
        </Muted>

        {!data.canSeeDetails && (
          <Card>
            <Muted>
              Join this competition on the website to see its games.
            </Muted>
          </Card>
        )}

        {data.standings && data.standings.length > 0 && (
          <Card>
            <Heading c={c}>Table</Heading>
            <Row c={c} cells={['#', 'Player', 'W', 'D', 'L', 'Pts']} head />
            {data.standings.map((row, i) => (
              <Row
                key={row.player.id}
                c={c}
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
          </Card>
        )}

        {[...rounds.entries()].map(([round, matches]) => (
          <Card key={round}>
            <Heading c={c}>{`Round ${round}`}</Heading>
            {matches.map((m) => (
              <View key={m.id} style={styles.match}>
                <Text style={[styles.players, { color: c.text }]}>
                  {m.bye
                    ? `${shown(m.bye)} has a bye`
                    : `${shown(m.home)}  ${score(m)}  ${shown(m.away)}`}
                </Text>
                <Muted>
                  {STATUS[m.status] ?? m.status}
                  {m.status === 'live' || m.status === 'upcoming'
                    ? ` · due ${new Date(m.dueAt).toLocaleDateString()}`
                    : ''}
                  {m.report ? ' · result reported, waiting to confirm' : ''}
                </Muted>
              </View>
            ))}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  )
}

function Heading({ c, children }: { c: Colors; children: string }) {
  return <Text style={[styles.heading, { color: c.text }]}>{children}</Text>
}

function Row({
  c,
  cells,
  head,
}: {
  c: Colors
  cells: string[]
  head?: boolean
}) {
  return (
    <View style={[styles.row, { borderColor: c.border }]}>
      {cells.map((cell, i) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
          key={i}
          numberOfLines={1}
          style={[
            i === 1 ? styles.wide : styles.narrow,
            {
              color: head ? c.muted : c.text,
              fontWeight: head ? '600' : '400',
            },
          ]}
        >
          {cell}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  heading: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wide: { flex: 1 },
  narrow: { width: 36, textAlign: 'center' },
  match: { paddingVertical: 8, gap: 2 },
  players: { fontSize: 15, fontWeight: '500' },
})
