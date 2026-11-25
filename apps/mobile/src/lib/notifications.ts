import type { ApiClient } from '@misri/api-client'
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
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Matches and results',
    importance: Notifications.AndroidImportance.HIGH,
  })
  const { granted } = await Notifications.requestPermissionsAsync()
  if (!granted) return
  const { data: token } = await Notifications.getDevicePushTokenAsync()
  if (typeof token === 'string') await api.act('saveAppPush', { token })
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
