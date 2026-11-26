import * as Network from 'expo-network'
import { Button, Card, CloseButton, useThemeColor } from 'heroui-native'
import { useEffect, useSyncExternalStore } from 'react'
import { Alert, AppState, Modal, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { IconBadge, Kicker } from '@/competitions'
import { Icon } from '@/icon'
import { formatDate } from '@/lib/format'
import { play } from '@/lib/sound'
import { speedLabel, timeLeft } from '@/lib/time-left'
import {
  cancelDownload,
  type Download,
  installUpdate,
  pauseDownload,
  putOff,
  refreshUpdate,
  startDownload,
  updateStore,
  wasPutOff,
} from '@/lib/update'

// opening the app or coming back to it checks at most this often; opening
// the update page always looks again (refreshUpdate's own minute aside)
const EVERY = 30 * 60 * 1000

const SECTIONS = [
  { kind: 'new', title: "What's new", icon: 'Stars' },
  { kind: 'fix', title: 'Bug fixes', icon: 'Bug' },
] as const

const onWifi = () =>
  Network.getNetworkStateAsync()
    .then((n) => n.type === Network.NetworkStateType.WIFI)
    .catch(() => false)

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
      refreshUpdate(EVERY)
        .then(async (found) => {
          if (!active || !found) return
          // on Wi-Fi it downloads by itself; on mobile data it waits to be asked
          if (
            updateStore.get().download.status === 'idle' &&
            (await onWifi())
          ) {
            void startDownload(found)
          }
          if (!active || updateStore.get().open) return
          // the page opens by itself once per version; the top bar keeps it after
          if (await wasPutOff(found.tag)) return
          if (!active) return
          play('navigate')
          updateStore.set({ open: true })
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

  // opened (top bar, notification): the newest release, not the last one seen
  useEffect(() => {
    if (open) void refreshUpdate().catch(() => {})
  }, [open])

  if (!update || !open) return null
  const busy = ['downloading', 'paused', 'ready'].includes(download.status)
  // while downloading, closing just minimises: the top bar shows the progress
  const later = () => {
    if (!busy) void putOff(update.tag)
    updateStore.set({ open: false })
  }
  const facts = [
    `Version ${update.version}`,
    // versions skipped: one install brings them all
    ...(update.releases > 1 ? [`${update.releases} updates in one`] : []),
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
  if (download.status === 'downloading' || download.status === 'paused') {
    const running = download.status === 'downloading'
    return (
      <>
        <Progress
          written={download.written}
          total={download.total}
          label={running ? 'Downloading' : 'Paused'}
          speed={running ? download.speed : 0}
        />
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant={running ? 'secondary' : 'primary'}
            onPress={() =>
              running ? pauseDownload() : void startDownload(update)
            }
          >
            <Button.Label numberOfLines={1}>
              {running ? 'Pause' : 'Resume'}
            </Button.Label>
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            onPress={confirmCancel}
          >
            <Button.Label numberOfLines={1}>Cancel</Button.Label>
          </Button>
        </View>
        <Button variant="ghost" onPress={later}>
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
  // stopped part-way: carries on from where it got to
  const partWay = download.status === 'failed' && download.written > 0
  return (
    <>
      {download.status === 'failed' && (
        <Text className="font-normal text-center text-xs text-danger">
          {download.error}
        </Text>
      )}
      {partWay && (
        <Progress
          written={download.written}
          total={download.total}
          label="Stopped"
        />
      )}
      <Button size="lg" onPress={() => void startDownload(update)}>
        {partWay
          ? 'Resume download'
          : download.status === 'failed'
            ? 'Try again'
            : `Update now · ${megabytes(size)}`}
      </Button>
      {partWay ? (
        <Button variant="ghost" onPress={confirmCancel}>
          Cancel download
        </Button>
      ) : (
        <Button variant="ghost" onPress={later}>
          Update later
        </Button>
      )}
    </>
  )
}

/** Asks first: cancelling throws away what has come down so far. */
function confirmCancel() {
  Alert.alert(
    'Cancel the download?',
    'What has downloaded so far is deleted. You can start again any time.',
    [
      { text: 'Keep downloading', style: 'cancel' },
      {
        text: 'Cancel download',
        style: 'destructive',
        onPress: cancelDownload,
      },
    ],
  )
}

function Progress({
  written,
  total,
  label,
  speed = 0,
}: {
  written: number
  total: number
  label: string
  /** bytes a second while downloading; 0 hides the estimate */
  speed?: number
}) {
  const percent = Math.round((total ? written / total : 0) * 100)
  const left = timeLeft(total - written, speed)
  return (
    <View className="gap-1.5">
      <View className="h-2 overflow-hidden rounded-full bg-default">
        <View
          className={`h-full rounded-full ${label === 'Downloading' ? 'bg-accent' : 'bg-muted'}`}
          style={{ width: `${percent}%` }}
        />
      </View>
      <Text
        className="font-normal text-center text-xs text-muted"
        accessibilityLiveRegion="polite"
      >
        {`${label} · ${megabytes(written)} of ${megabytes(total)} · ${percent}%`}
      </Text>
      {label === 'Downloading' && (
        <Text className="font-normal text-center text-xs text-muted">
          {left
            ? `${speedLabel(speed)} · ${left}`
            : 'Working out the time left…'}
        </Text>
      )}
    </View>
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
  if (download.status === 'downloading' || download.status === 'paused') {
    const share = download.total ? download.written / download.total : 0
    const around = 2 * Math.PI * 13
    const running = download.status === 'downloading'
    return (
      <Button
        size="sm"
        variant="ghost"
        isIconOnly
        accessibilityLabel={`${running ? 'Downloading' : 'Paused'}: the update, ${Math.round(share * 100)}%`}
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
            <Icon
              name={running ? 'Download' : 'Pause'}
              size={14}
              color={accent}
            />
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
        <Icon name="Download" size={19} color={accent} />
      </Button>
      {/* like the bell's badge: on the corner, ringed so it reads on any bar */}
      <View
        pointerEvents="none"
        className="absolute top-0.5 right-0.5 size-3 rounded-full border-2 border-background bg-accent"
      />
    </View>
  )
}
