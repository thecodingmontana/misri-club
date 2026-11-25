import type { InboxItem } from '@misri/api-client'
import { router } from 'expo-router'
import { Card, PressableFeedback, Skeleton } from 'heroui-native'
import { useEffect } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { EmptyCard, PageTitle } from '@/competitions'
import { Problem, Screen } from '@/components'
import { relativeTime } from '@/lib/format'
import { appRoute } from '@/lib/notifications'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'

/** Everything Misri told you, newest first; opening it reads them all. */
export default function Inbox() {
  const { api } = useSession()
  const { data, error, loading, reload } = useLoad(
    () => (api ? api.inbox() : Promise.resolve(null)),
    String(Boolean(api)),
  )

  useEffect(() => {
    if (api && data?.some((n) => !n.readAt)) {
      void api.act('markInboxRead', {}).catch(() => {})
    }
  }, [api, data])

  if (error && !data) {
    return (
      <Screen>
        <Problem message={error} onRetry={reload} />
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-5 p-4"
        refreshControl={
          <RefreshControl
            refreshing={loading && Boolean(data)}
            onRefresh={reload}
          />
        }
      >
        <PageTitle title="Inbox" />
        {!data ? (
          <View className="gap-3">
            <Skeleton className="h-16 rounded-3xl" />
            <Skeleton className="h-16 rounded-3xl" />
            <Skeleton className="h-16 rounded-3xl" />
          </View>
        ) : data.length === 0 ? (
          <EmptyCard>
            Nothing yet. Starts, results, reminders and requests show up here.
          </EmptyCard>
        ) : (
          data.map((n) => <Notice key={n.id} item={n} />)
        )}
      </ScrollView>
    </Screen>
  )
}

/** One notification; its link opens the app's page for it when there is one. */
function Notice({ item }: { item: InboxItem }) {
  const target = appRoute(item.url)
  return (
    <Card className="p-0">
      <PressableFeedback
        className="flex-row gap-3 px-4 py-3"
        isDisabled={!target}
        onPress={() => target && router.push(target as never)}
      >
        <View
          className={`mt-1.5 size-2 rounded-full ${item.readAt ? '' : 'bg-accent'}`}
        />
        <View className="flex-1">
          <Text className="font-semibold text-sm text-foreground">
            {item.title}
          </Text>
          {item.body && (
            <Text className="font-normal text-sm text-muted">{item.body}</Text>
          )}
          <Text className="font-normal mt-0.5 text-xs text-muted">
            {item.readAt ? '' : 'New · '}
            {relativeTime(item.createdAt)}
          </Text>
        </View>
      </PressableFeedback>
    </Card>
  )
}
