import type { CompetitionPage } from '@misri/api-client'
import { router, Stack } from 'expo-router'
import { Button, ListGroup } from 'heroui-native'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { Loading, Problem, Screen } from '@/components'
import { Icon } from '@/icon'
import { useSession } from '@/lib/session'
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
const STATUS: Record<string, string> = {
  open: 'Not started',
  running: 'Running',
  finished: 'Finished',
}

export default function Home() {
  const { api } = useSession()
  const { data, error, loading, reload } = useLoad(
    async () => {
      if (!api) return null
      const [mine, open] = await Promise.all([
        api.myCompetitions(),
        api.openCompetitions(),
      ])
      const joined = new Set(mine.map((m) => m.slug))
      return {
        mine: mine as Summary[],
        open: (open as Summary[]).filter((o) => !joined.has(o.slug)),
      }
    },
    String(Boolean(api)),
  )

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              accessibilityLabel="Account"
              onPress={() => router.push('/account')}
            >
              <Icon name="UserRound" />
            </Button>
          ),
        }}
      />
      {error && !data ? (
        <Problem message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerClassName="gap-6 p-4"
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} />
          }
        >
          <Section title="Your competitions" items={data.mine}>
            <Text className="text-sm text-muted">
              No competitions yet. Create one or join with an invite link on the
              website.
            </Text>
          </Section>
          {data.open.length > 0 && (
            <Section title="Open to join" items={data.open} />
          )}
        </ScrollView>
      )}
    </Screen>
  )
}

function Section({
  title,
  items,
  children,
}: {
  title: string
  items: Summary[]
  children?: React.ReactNode
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase text-muted">
        {title}
      </Text>
      {items.length === 0 ? (
        children
      ) : (
        <ListGroup>
          {items.map((item) => (
            <ListGroup.Item
              key={item.slug}
              onPress={() => router.push(`/c/${item.slug}`)}
            >
              <ListGroup.ItemPrefix>
                <Icon name="Trophy" />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{item.name}</ListGroup.ItemTitle>
                <ListGroup.ItemDescription>
                  {FORMAT[item.format] ?? item.format} · {item.members}{' '}
                  {item.members === 1 ? 'player' : 'players'} ·{' '}
                  {STATUS[item.status] ?? item.status}
                </ListGroup.ItemDescription>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix />
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </View>
  )
}
