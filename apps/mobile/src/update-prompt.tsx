import * as Linking from 'expo-linking'
import { Button, Dialog } from 'heroui-native'
import { useEffect, useState } from 'react'
import { AppState, ScrollView, Text, View } from 'react-native'
import { IconBadge } from '@/competitions'
import { play } from '@/lib/sound'
import { checkForUpdate, putOff, type Update } from '@/lib/update'

const EVERY = 6 * 60 * 60 * 1000

/**
 * Offers a newer app as soon as one is released: checked when the app opens
 * and when it comes back to the front (at most every few hours), with what's
 * new and a button that downloads it.
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
    <Dialog isOpen onOpenChange={(open) => !open && later()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <View className="mb-4 items-center gap-3">
            <IconBadge name="Smartphone" size={52} />
            <Dialog.Title className="text-center">
              A new Misri is ready
            </Dialog.Title>
            <Dialog.Description className="text-center">
              {`Version ${update.version}. It installs over this one; your account and settings stay.`}
            </Dialog.Description>
          </View>
          <Text className="font-semibold mb-2 text-xs uppercase tracking-widest text-muted">
            What's new
          </Text>
          <ScrollView className="max-h-56">
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
          <View className="mt-5 gap-2">
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
