import { Button, Spinner, useThemeColor } from 'heroui-native'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon } from '@/icon'
import { useSession } from '@/lib/session'

export default function SignIn() {
  const { signIn } = useSession()
  const onAccent = useThemeColor('accent-foreground')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      await signIn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 justify-between bg-background p-6">
      <View className="mt-16 gap-3">
        <Icon name="Trophy" size={48} />
        <Text className="text-3xl font-bold text-foreground">
          Misri Chess Club
        </Text>
        <Text className="text-base text-foreground">
          Leagues, knockouts and 1v1 challenges for your club.
        </Text>
        <Text className="text-sm text-muted">
          You sign in on the Misri website, with Google, an emailed link or a
          passkey, then come straight back here.
        </Text>
      </View>
      <View className="gap-3">
        <Button size="lg" onPress={start} isDisabled={busy}>
          {busy ? (
            <Spinner color={onAccent} />
          ) : (
            <Button.Label>Sign in</Button.Label>
          )}
        </Button>
        {error && (
          <Text className="text-center text-sm text-danger">{error}</Text>
        )}
      </View>
    </SafeAreaView>
  )
}
