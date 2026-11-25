import { router, Stack } from 'expo-router'
import { Button, Skeleton } from 'heroui-native'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { PageTitle } from '@/competitions'
import { Problem, Screen } from '@/components'
import { games } from '@/lib/my-games'

/**
 * The app-icon shortcut's "Next game": straight to the competition with your
 * nearest deadline, or a word that nothing is due.
 */
export default function NextGame() {
  const [state, setState] = useState<'finding' | 'none' | 'failed'>('finding')
  const [attempt, setAttempt] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries
  useEffect(() => {
    let live = true
    setState('finding')
    games()
      .then(({ next, unavailable }) => {
        if (!live) return
        if (next) router.replace(`/c/${next.slug}`)
        else setState(unavailable ? 'failed' : 'none')
      })
      .catch(() => live && setState('failed'))
    // left the screen first: don't jump somewhere else
    return () => {
      live = false
    }
  }, [attempt])
  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <View className="gap-4 p-4">
        <PageTitle title="Your next game" />
        {state === 'none' ? (
          <>
            <Text className="text-center font-normal text-sm text-muted">
              No games due. You're all caught up.
            </Text>
            <Button onPress={() => router.replace('/')}>
              Your competitions
            </Button>
          </>
        ) : state === 'failed' ? (
          <Problem
            message="Couldn't check your games. Check your connection and try again."
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : (
          <Skeleton className="h-24 w-full rounded-2xl" />
        )}
      </View>
    </Screen>
  )
}
