import { Button, Card, CloseButton, useThemeColor } from 'heroui-native'
import { useEffect, useSyncExternalStore } from 'react'
import { AppState, Modal, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { IconBadge, Kicker } from '@/competitions'
import { Icon } from '@/icon'
import { formatDate } from '@/lib/format'
import { play } from '@/lib/sound'
import {
  checkForUpdate,
  clearOldDownloads,
  type Download,
  downloaded,
  installUpdate,
  putOff,
  startDownload,
  updateStore,
  wasPutOff,
} from '@/lib/update'

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
  const { update, open, download } = useUpdate()

  useEffect(() => {
    let active = true
    const check = () => {
      if (Date.now() - lastCheck < EVERY) return
      lastCheck = Date.now()
      checkForUpdate()
        .then(async (found) => {
          if (!active) return
          if (!found) {
            clearOldDownloads()
            return updateStore.set({ update: null, open: false })
          }
          // the page opens by itself once per version; the top bar keeps it after
          const opens = !(await wasPutOff(found.tag))
          if (!active) return
          if (opens) play('navigate')
          updateStore.set({
            update: found,
            open: opens,
            // downloaded before the app was closed: ready to install
            ...(downloaded(found) ? { download: { status: 'ready' } } : {}),
          })
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
  const busy = download.status === 'downloading' || download.status === 'ready'
  // while downloading, closing just minimises: the top bar shows the progress
  const later = () => {
    if (!busy) void putOff(update.tag)
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
            It downloads here and installs over this one; your account and
            settings stay. The first time, Android asks you to allow Misri to
            install updates.
          </Text>
        </ScrollView>
        <View
          className="gap-2 border-t border-border bg-background px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Actions download={download} size={update.size} later={later} />
        </View>
      </View>
    </Modal>
  )
}

/** The page's buttons, following the download. */
function Actions({
  download,
  size,
  later,
}: {
  download: Download
  size: number
  later: () => void
}) {
  const { update } = useUpdate()
  if (!update) return null
  if (download.status === 'downloading') {
    const share = download.total ? download.written / download.total : 0
    return (
      <>
        <View className="gap-1.5">
          <View className="h-2 overflow-hidden rounded-full bg-default">
            <View
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </View>
          <Text
            className="font-normal text-center text-xs text-muted"
            accessibilityLiveRegion="polite"
          >
            {`Downloading · ${megabytes(download.written)} of ${megabytes(download.total)} · ${Math.round(share * 100)}%`}
          </Text>
        </View>
        <Button variant="secondary" onPress={later}>
          Keep using Misri
        </Button>
      </>
    )
  }
  if (download.status === 'ready') {
    return (
      <>
        <Button size="lg" onPress={() => void installUpdate()}>
          Install update
        </Button>
        <Button variant="ghost" onPress={later}>
          Install later
        </Button>
      </>
    )
  }
  return (
    <>
      {download.status === 'failed' && (
        <Text className="font-normal text-center text-xs text-danger">
          {download.error}
        </Text>
      )}
      <Button size="lg" onPress={() => void startDownload(update)}>
        {download.status === 'failed'
          ? 'Try again'
          : `Update now · ${megabytes(size)}`}
      </Button>
      <Button variant="ghost" onPress={later}>
        Update later
      </Button>
    </>
  )
}

/** The newer app waiting to be installed, if any, and whether its page is open. */
export function useUpdate() {
  return useSyncExternalStore(updateStore.subscribe, updateStore.get)
}

/** The top bar's reminder: shown while a newer app waits; opens its page. */
export function UpdateButton() {
  const { update, download } = useUpdate()
  const [accent, track] = useThemeColor(['accent', 'border'])
  if (!update) return null
  if (download.status === 'downloading') {
    const share = download.total ? download.written / download.total : 0
    const around = 2 * Math.PI * 13
    return (
      <Button
        size="sm"
        variant="ghost"
        isIconOnly
        accessibilityLabel={`Downloading the update, ${Math.round(share * 100)}%`}
        onPress={() => updateStore.set({ open: true })}
      >
        <View className="items-center justify-center">
          <Svg width={30} height={30} viewBox="0 0 30 30">
            <Circle
              cx={15}
              cy={15}
              r={13}
              stroke={track}
              strokeWidth={2.5}
              fill="none"
            />
            <Circle
              cx={15}
              cy={15}
              r={13}
              stroke={accent}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${around * share} ${around}`}
              transform="rotate(-90 15 15)"
            />
          </Svg>
          <View className="absolute">
            <Icon name="ArrowUp" size={14} color={accent} />
          </View>
        </View>
      </Button>
    )
  }
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
