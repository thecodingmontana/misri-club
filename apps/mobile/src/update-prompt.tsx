import * as Linking from 'expo-linking'
import { Button, Card, CloseButton, useThemeColor } from 'heroui-native'
import { useEffect, useSyncExternalStore } from 'react'
import { AppState, Modal, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { IconBadge, Kicker } from '@/competitions'
import { Icon } from '@/icon'
import { formatDate } from '@/lib/format'
import { play } from '@/lib/sound'
import { checkForUpdate, putOff, updateStore, wasPutOff } from '@/lib/update'

const EVERY = 6 * 60 * 60 * 1000
// survives the page remounting on sign-in or navigation
let lastCheck = 0

const SECTIONS = [
  { kind: 'new', title: "What's new", icon: 'Stars' },
  { kind: 'fix', title: 'Bug fixes', icon: 'Bug' },
] as const

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/**
 * Offers a newer app as soon as one is released: checked when the app opens
 * and when it comes back to the front (at most every few hours). A whole page:
 * what's new scrolls, Update now stays at the bottom.
 */
export function UpdatePrompt() {
  const insets = useSafeAreaInsets()
  const { update, open } = useUpdate()

  useEffect(() => {
    let active = true
    const check = () => {
      if (Date.now() - lastCheck < EVERY) return
      lastCheck = Date.now()
      checkForUpdate()
        .then(async (found) => {
          if (!active) return
          if (!found) return updateStore.set({ update: null, open: false })
          // the page opens by itself once per version; the top bar keeps it after
          const opens = !(await wasPutOff(found.tag))
          if (!active) return
          if (opens) play('navigate')
          updateStore.set({ update: found, open: opens })
        })
        .catch(() => {})
    }
    check()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check()
    })
    return () => {
      active = false
      sub.remove()
    }
  }, [])

  if (!update || !open) return null
  const later = () => {
    void putOff(update.tag)
    updateStore.set({ open: false })
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
          {SECTIONS.map(({ kind, title, icon }) => {
            const notes = update.notes.filter((n) => n.kind === kind)
            if (!notes.length) return null
            return (
              <View key={kind} className="gap-3">
                <View className="flex-row items-center gap-2">
                  <IconBadge name={icon} size={32} />
                  <Kicker>{title}</Kicker>
                </View>
                <Card>
                  <Card.Body className="gap-3">
                    {notes.map((note) => (
                      <View key={note.text} className="flex-row gap-3">
                        <View className="mt-2 size-1.5 rounded-full bg-accent" />
                        <Text className="font-normal flex-1 text-base text-foreground">
                          {note.text}
                        </Text>
                      </View>
                    ))}
                  </Card.Body>
                </Card>
              </View>
            )
          })}
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
              updateStore.set({ open: false })
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

/** The newer app waiting to be installed, if any, and whether its page is open. */
export function useUpdate() {
  return useSyncExternalStore(updateStore.subscribe, updateStore.get)
}

/** The top bar's reminder: shown while a newer app waits; opens its page. */
export function UpdateButton() {
  const { update } = useUpdate()
  const accent = useThemeColor('accent')
  if (!update) return null
  return (
    // the dot sits beside the button, which clips what overflows it
    <View>
      <Button
        size="sm"
        variant="ghost"
        isIconOnly
        accessibilityLabel={`Update available: version ${update.version}`}
        onPress={() => updateStore.set({ open: true })}
      >
        <Icon name="ArrowUp" size={19} color={accent} />
      </Button>
      <View
        pointerEvents="none"
        className="absolute top-1 right-1 size-2 rounded-full bg-accent"
      />
    </View>
  )
}
