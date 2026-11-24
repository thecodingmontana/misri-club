import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Body, Button, Muted, Title } from '@/components'
import { useSession } from '@/lib/session'
import { useColors } from '@/lib/theme'

export default function SignIn() {
  const { signIn } = useSession()
  const c = useColors()
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
    <SafeAreaView style={[styles.page, { backgroundColor: c.background }]}>
      <View style={styles.text}>
        <Title>Misri Chess Club</Title>
        <Body>Leagues, knockouts and 1v1 challenges for your club.</Body>
        <Muted>
          You sign in on the Misri website, with Google, an emailed link or a
          passkey, then come straight back here.
        </Muted>
      </View>
      <View style={styles.actions}>
        <Button label="Sign in" onPress={start} busy={busy} />
        {error && <Muted>{error}</Muted>}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, justifyContent: 'space-between' },
  text: { gap: 12, marginTop: 64 },
  actions: { gap: 12 },
})
