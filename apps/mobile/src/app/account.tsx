import * as WebBrowser from 'expo-web-browser'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Body, Button, Card, Loading, Muted, Screen } from '@/components'
import { SITE_URL } from '@/lib/config'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'

export default function Account() {
  const { api, signOut } = useSession()
  const [busy, setBusy] = useState(false)
  const { data: me } = useLoad(
    () => (api ? api.me() : Promise.resolve(null)),
    String(Boolean(api)),
  )

  return (
    <Screen>
      <View style={styles.page}>
        {me ? (
          <Card>
            <Body>{me.name}</Body>
            <Muted>
              {me.chessUsername
                ? `chess.com: ${me.chessUsername}`
                : 'No chess.com account linked'}
            </Muted>
          </Card>
        ) : (
          <Loading />
        )}
        <Button
          label="Manage account on the website"
          variant="ghost"
          onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/account`)}
        />
        <Button
          label="Sign out"
          busy={busy}
          onPress={async () => {
            setBusy(true)
            await signOut()
          }}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({ page: { padding: 16, gap: 12 } })
