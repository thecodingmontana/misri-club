import type { ApiClient } from '@misri/api-client'
import { PUSH_KINDS } from '@misri/core/push-kinds'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { Platform } from 'react-native'
import { installUpdate, updateStore } from '@/lib/update'

// shown even while the app is open, as on the website
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

/** The app's page for a website link in a notification, or null. */
export function appRoute(url: string): string | null {
  const competition = /^\/c\/([^/?#]+)/.exec(url)?.[1]
  if (competition) return `/c/${competition}`
  const invite = /^\/join\/([^/?#]+)/.exec(url)?.[1]
  if (invite) return `/join/${invite}`
  const player = /^\/p\/([^/?#]+)/.exec(url)?.[1]
  if (player) return `/p/${player}`
  if (url === '/inbox' || url.startsWith('/train')) return url
  return null
}

// Whether this phone's token reached the server this session: until it has,
// "on" would be a promise the server can't keep.
let saving: Promise<boolean> | null = null

/**
 * Asks once for permission, then gives the server this phone's FCM token so
 * pushes reach it. Quiet when refused or when the build has no Firebase.
 * Resolves whether the server has the token.
 */
export function registerForPush(api: ApiClient): Promise<boolean> {
  saving = register(api).catch(() => false)
  return saving
}

async function register(api: ApiClient) {
  if (Platform.OS !== 'android') return false
  // a muted old catch-all channel: keep the new ones quiet too
  const old = await Notifications.getNotificationChannelAsync('default')
  const muted = old?.importance === Notifications.AndroidImportance.NONE
  // one channel per kind, so a kind can be muted in the phone's settings
  for (const [id, name] of Object.entries(PUSH_KINDS)) {
    await Notifications.setNotificationChannelAsync(id, {
      name,
      importance: muted
        ? Notifications.AndroidImportance.NONE
        : Notifications.AndroidImportance.HIGH,
    })
  }
  if (old) await Notifications.deleteNotificationChannelAsync('default')
  const { granted } = await Notifications.requestPermissionsAsync()
  if (!granted) return false
  const { data: token } = await Notifications.getDevicePushTokenAsync()
  if (typeof token !== 'string') return false
  await api.act('saveAppPush', { token })
  return true
}

/**
 * 'on' (allowed and this phone registered), 'off' (we can ask or retry), or
 * 'blocked' (only the phone's settings can turn it on).
 */
export async function pushStatus(): Promise<'on' | 'off' | 'blocked'> {
  if (Platform.OS !== 'android') return 'off'
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync()
  if (!granted) return canAskAgain ? 'off' : 'blocked'
  return (await (saving ?? Promise.resolve(false))) ? 'on' : 'off'
}

/** Tapping a notification opens its page (also when it started the app). */
export function openTappedNotifications() {
  const open = (response: Notifications.NotificationResponse | null) => {
    const data = response?.notification.request.content.data
    // "ready to install": straight to Android's installer
    if (data?.install) {
      updateStore.set({ open: true })
      void installUpdate().catch(() => {})
      return
    }
    const url = data?.url
    const route = typeof url === 'string' ? appRoute(url) : null
    router.push((route ?? '/inbox') as never)
  }
  const last = Notifications.getLastNotificationResponse()
  if (last) open(last)
  const sub = Notifications.addNotificationResponseReceivedListener(open)
  return () => sub.remove()
}
