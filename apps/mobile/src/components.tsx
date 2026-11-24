import { Button, Spinner } from 'heroui-native'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

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
