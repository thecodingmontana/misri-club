import { Button, Spinner } from 'heroui-native'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { relativeTime } from './lib/format'

export function Screen({ children }: { children: ReactNode }) {
  return <View className="flex-1 bg-background">{children}</View>
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center">
      <Spinner />
    </View>
  )
}

export function Problem({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6">
      <Text className="text-base font-semibold text-foreground">
        Couldn't load this
      </Text>
      <Text className="font-normal text-center text-sm text-muted">
        {message}
      </Text>
      <Button variant="secondary" onPress={onRetry}>
        Try again
      </Button>
    </View>
  )
}

/** Offline, a kept page says how old it is. */
export function SavedNote({
  savedAt,
  error,
}: {
  savedAt: number | null
  error: string | null
}) {
  if (!savedAt || !error) return null
  return (
    <View className="rounded-xl bg-surface px-3 py-2">
      <Text
        className="text-center font-normal text-xs text-muted"
        accessibilityLiveRegion="polite"
      >
        {`Offline · last updated ${relativeTime(savedAt)}. Pull down to try again.`}
      </Text>
    </View>
  )
}
