import * as Linking from 'expo-linking'
import { Button, Card } from 'heroui-native'
import { useEffect, useState } from 'react'
import { AppState, Modal, ScrollView, Text, View } from 'react-native'
import { IconBadge } from '@/competitions'
import { play } from '@/lib/sound'
import { checkForUpdate, putOff, type Update } from '@/lib/update'

const EVERY = 6 * 60 * 60 * 1000

/**
 * Offers a newer app as soon as one is released: checked when the app opens
 * and when it comes back to the front (at most every few hours), with what's
 * new and a button that downloads it. A plain centred modal, so it sits the
 * same on every screen size.
 */
export function UpdatePrompt() {
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
  return (
    <Modal transparent animationType="fade" onRequestClose={later}>
      <View className="flex-1 items-center justify-center bg-black/60 p-5">
        <Card className="w-full max-w-sm">
          <Card.Body className="gap-4">
            <View className="items-center gap-2">
              <IconBadge name="Smartphone" size={52} />
              <Text className="font-display text-center text-3xl uppercase text-foreground">
                A new Misri is ready
              </Text>
              <Text className="font-normal text-center text-sm text-muted">
                {`Version ${update.version}. It installs over this one; your account and settings stay.`}
              </Text>
            </View>
            <View className="gap-2">
              <Text className="font-semibold text-xs uppercase tracking-widest text-muted">
                What's new
              </Text>
              <ScrollView style={{ maxHeight: 180 }}>
                <View className="gap-2">
                  {update.notes.map((note) => (
                    <View key={note} className="flex-row gap-2">
                      <Text className="font-bold text-accent">•</Text>
                      <Text className="font-normal flex-1 text-sm text-foreground">
                        {note}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View className="gap-2">
              <Button
                onPress={() => {
                  void Linking.openURL(update.apk)
                  setUpdate(null)
                }}
              >
                Update now
              </Button>
              <Button variant="ghost" onPress={later}>
                Later
              </Button>
            </View>
          </Card.Body>
        </Card>
      </View>
    </Modal>
  )
}
