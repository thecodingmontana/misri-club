import * as Linking from 'expo-linking'
import { Button, Card, CloseButton } from 'heroui-native'
import { useEffect, useState } from 'react'
import { AppState, Modal, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { IconBadge, Kicker } from '@/competitions'
import { formatDate } from '@/lib/format'
import { play } from '@/lib/sound'
import { checkForUpdate, putOff, type Update } from '@/lib/update'

const EVERY = 6 * 60 * 60 * 1000

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/**
 * Offers a newer app as soon as one is released: checked when the app opens
 * and when it comes back to the front (at most every few hours). A whole page:
 * what's new scrolls, Update now stays at the bottom.
 */
export function UpdatePrompt() {
  const insets = useSafeAreaInsets()
  const [update, setUpdate] = useState<Update | null>(null)

  useEffect(() => {
    let last = 0
    const check = () => {
      if (Date.now() - last < EVERY) return
      last = Date.now()
      checkForUpdate()
        .then((found) => {
          if (found) {
            play('navigate')
            setUpdate(found)
          }
        })
        .catch(() => {})
    }
    check()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check()
    })
    return () => sub.remove()
  }, [])

  if (!update) return null
  const later = () => {
    void putOff(update.tag)
    setUpdate(null)
  }
  const facts = [
    `Version ${update.version}`,
    megabytes(update.size),
    ...(update.date ? [formatDate(update.date)] : []),
  ]
  return (
    <Modal animationType="slide" onRequestClose={later}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="flex-row justify-end px-3 py-2">
          <CloseButton accessibilityLabel="Close" onPress={later} />
        </View>
        <ScrollView contentContainerClassName="gap-6 px-5 pb-6">
          <View className="items-center gap-3">
            <IconBadge name="Smartphone" size={72} />
            <Text className="font-display text-center text-5xl uppercase text-foreground">
              A new Misri{'\n'}
              <Text className="text-accent">is ready.</Text>
            </Text>
            <Text className="font-medium text-center text-sm text-muted">
              {facts.join(' · ')}
            </Text>
          </View>
          <View className="gap-3">
            <Kicker>What's new</Kicker>
            <Card>
              <Card.Body className="gap-3">
                {update.notes.map((note) => (
                  <View key={note} className="flex-row gap-3">
                    <Text className="font-bold text-accent">•</Text>
                    <Text className="font-normal flex-1 text-base text-foreground">
                      {note}
                    </Text>
                  </View>
                ))}
              </Card.Body>
            </Card>
          </View>
          <Text className="font-normal text-center text-xs text-muted">
            It installs over this one; your account and settings stay. Android
            may ask you to allow installing from your browser.
          </Text>
        </ScrollView>
        <View
          className="gap-2 border-t border-border bg-background px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button
            size="lg"
            onPress={() => {
              void Linking.openURL(update.apk)
              setUpdate(null)
            }}
          >
            {`Update now · ${megabytes(update.size)}`}
          </Button>
          <Button variant="ghost" onPress={later}>
            Update later
          </Button>
        </View>
      </View>
    </Modal>
  )
}
