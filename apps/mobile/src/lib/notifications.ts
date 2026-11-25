import type { ApiClient } from '@misri/api-client'
import { PUSH_KINDS } from '@misri/core/push-kinds'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { Platform } from 'react-native'

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
  return url === '/inbox' ? '/inbox' : null
}

/**
 * Asks once for permission, then gives the server this phone's FCM token so
 * pushes reach it. Quiet when refused or when the build has no Firebase.
 */
export async function registerForPush(api: ApiClient) {
  if (Platform.OS !== 'android') return
  // one channel per kind, so a kind can be muted in the phone's settings
  for (const [id, name] of Object.entries(PUSH_KINDS)) {
    await Notifications.setNotificationChannelAsync(id, {
      name,
      importance: Notifications.AndroidImportance.HIGH,
    })
  }
  await Notifications.deleteNotificationChannelAsync('default')
  const { granted } = await Notifications.requestPermissionsAsync()
  if (!granted) return
  const { data: token } = await Notifications.getDevicePushTokenAsync()
  if (typeof token === 'string') await api.act('saveAppPush', { token })
}

/** 'on', 'off' (we can ask), or 'blocked' (only the phone's settings can turn it on). */
export async function pushStatus(): Promise<'on' | 'off' | 'blocked'> {
  if (Platform.OS !== 'android') return 'off'
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync()
  return granted ? 'on' : canAskAgain ? 'off' : 'blocked'
}

/** Tapping a notification opens its page (also when it started the app). */
export function openTappedNotifications() {
  const open = (response: Notifications.NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url
    const route = typeof url === 'string' ? appRoute(url) : null
    router.push((route ?? '/inbox') as never)
  }
  const last = Notifications.getLastNotificationResponse()
  if (last) open(last)
  const sub = Notifications.addNotificationResponseReceivedListener(open)
  return () => sub.remove()
}
