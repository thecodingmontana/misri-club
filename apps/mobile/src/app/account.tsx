import * as WebBrowser from 'expo-web-browser'
import { Button, Card, Spinner } from 'heroui-native'
import { useState } from 'react'
import { View } from 'react-native'
import { Loading, Screen } from '@/components'
import { Icon } from '@/icon'
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
      <View className="gap-3 p-4">
        {me ? (
          <Card>
            <Card.Body>
              <Card.Title>{me.name}</Card.Title>
              <Card.Description>
                {me.chessUsername
                  ? `chess.com: ${me.chessUsername}`
                  : 'No chess.com account linked'}
              </Card.Description>
            </Card.Body>
          </Card>
        ) : (
          <Loading />
        )}
        <Button
          variant="secondary"
          onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/account`)}
        >
          <Icon name="ExternalLink" />
          <Button.Label>Manage account on the website</Button.Label>
        </Button>
        <Button
          variant="danger-soft"
          isDisabled={busy}
          onPress={async () => {
            setBusy(true)
            await signOut()
          }}
        >
          {busy ? <Spinner /> : <Icon name="LogOut" />}
          <Button.Label>Sign out</Button.Label>
        </Button>
      </View>
    </Screen>
  )
}
