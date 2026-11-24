import type { CompetitionPage } from '@misri/api-client'
import { Link, Stack } from 'expo-router'
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
} from 'react-native'
import { Card, Loading, Muted, Problem, Screen } from '@/components'
import { useSession } from '@/lib/session'
import { useColors } from '@/lib/theme'
import { useLoad } from '@/lib/use-load'

type Summary = {
  slug: string
  name: string
  format: CompetitionPage['competition']['format']
  status: string
  members: number
}

const FORMAT: Record<string, string> = {
  league: 'League',
  knockout: 'Knockout',
  groups: 'Groups and knockout',
  challenge: '1v1 challenge',
}

export default function Home() {
  const { api } = useSession()
  const c = useColors()
  const { data, error, loading, reload } = useLoad(
    async () => {
      if (!api) return null
      const [mine, open] = await Promise.all([
        api.myCompetitions(),
        api.openCompetitions(),
      ])
      const joined = new Set(mine.map((m) => m.slug))
      return [
        { title: 'Your competitions', data: mine as Summary[] },
        {
          title: 'Open to join',
          data: (open as Summary[]).filter((o) => !joined.has(o.slug)),
        },
      ].filter((s) => s.data.length > 0)
    },
    String(Boolean(api)),
  )

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/account" asChild>
              <Pressable accessibilityRole="button" hitSlop={12}>
                <Text style={{ color: c.primary, fontWeight: '600' }}>
                  Account
                </Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      {error && !data ? (
        <Problem message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <SectionList
          sections={data}
          keyExtractor={(item) => item.slug}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} />
          }
          ListEmptyComponent={
            <Muted>
              No competitions yet. Create one or join with an invite link on the
              website.
            </Muted>
          }
          renderSectionHeader={({ section }) => (
            <Text style={[styles.section, { color: c.muted }]}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <Link href={`/c/${item.slug}`} asChild>
              <Pressable accessibilityRole="link">
                <Card style={styles.item}>
                  <Text style={[styles.name, { color: c.text }]}>
                    {item.name}
                  </Text>
                  <Muted>
                    {FORMAT[item.format] ?? item.format} · {item.members}{' '}
                    {item.members === 1 ? 'player' : 'players'} ·{' '}
                    {item.status === 'open'
                      ? 'Not started'
                      : item.status === 'running'
                        ? 'Running'
                        : 'Finished'}
                  </Muted>
                </Card>
              </Pressable>
            </Link>
          )}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  item: { marginBottom: 8 },
  name: { fontSize: 17, fontWeight: '600' },
})
