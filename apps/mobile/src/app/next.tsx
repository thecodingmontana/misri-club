import { router, Stack } from 'expo-router'
import { Button, Skeleton } from 'heroui-native'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { PageTitle } from '@/competitions'
import { Screen } from '@/components'
import { games } from '@/lib/my-games'

/**
 * The app-icon shortcut's "Next game": straight to the competition with your
 * nearest deadline, or a word that nothing is due.
 */
export default function NextGame() {
  const [none, setNone] = useState(false)
  useEffect(() => {
    games()
      .then(({ next }) =>
        next ? router.replace(`/c/${next.slug}`) : setNone(true),
      )
      .catch(() => setNone(true))
  }, [])
  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <View className="gap-4 p-4">
        <PageTitle title="Your next game" />
        {none ? (
          <>
            <Text className="text-center font-normal text-sm text-muted">
              No games due. You're all caught up.
            </Text>
            <Button onPress={() => router.replace('/')}>
              Your competitions
            </Button>
          </>
        ) : (
          <Skeleton className="h-24 w-full rounded-2xl" />
        )}
      </View>
    </Screen>
  )
}
