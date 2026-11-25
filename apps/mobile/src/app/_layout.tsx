import '../global.css'
import { useFonts } from 'expo-font'
import { Redirect, Stack, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { HeroUINativeProvider, useThemeColor } from 'heroui-native'
import { useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useUniwind } from 'uniwind'
import { Loading, Screen } from '@/components'
import { trackScreen, trackUser } from '@/lib/analytics'
import { introSeen } from '@/lib/intro'
import { openTappedNotifications, registerForPush } from '@/lib/notifications'
import { scheduleReminders } from '@/lib/reminders'
import { SessionProvider, useSession } from '@/lib/session'
import { loadSoundSetting } from '@/lib/sound'
import { loadTheme } from '@/lib/theme'
import { UpdatePrompt } from '@/update-prompt'
import { refreshWidgets } from '@/widgets/register'

export default function RootLayout() {
  const [fontsReady] = useFonts({
    'Bricolage-Regular': require('../../assets/fonts/Bricolage-Regular.ttf'),
    'Bricolage-Medium': require('../../assets/fonts/Bricolage-Medium.ttf'),
    'Bricolage-SemiBold': require('../../assets/fonts/Bricolage-SemiBold.ttf'),
    'Bricolage-Bold': require('../../assets/fonts/Bricolage-Bold.ttf'),
    'BricolageCondensed-ExtraBold': require('../../assets/fonts/BricolageCondensed-ExtraBold.ttf'),
  })
  if (!fontsReady) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <SessionProvider>
          <Gate />
        </SessionProvider>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  )
}

/**
 * Signed out: the welcome screens (first launch), then sign-in. Signed in but
 * new: onboarding. Otherwise everything else.
 */
function Gate() {
  const { token, me, api } = useSession()
  const ready = Boolean(api && me?.onboarded)
  // signed in and set up: this phone gets pushes, and tapping one opens it
  useEffect(() => {
    if (!ready || !api) return
    void registerForPush(api).catch(() => {})
    void scheduleReminders().catch(() => {})
    // fresh games and standings on the home screen whenever the app opens
    refreshWidgets()
    return openTappedNotifications()
  }, [ready, api])
  const segments = useSegments()
  // the route pattern, e.g. /c/[slug]: which pages get used, not whose
  const route = `/${segments.join('/')}`
  useEffect(() => trackScreen(route), [route])
  const userId = me?.id ?? null
  useEffect(() => trackUser(userId), [userId])
  const [seen, setSeen] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    void Promise.all([loadTheme(), loadSoundSetting()]).finally(() =>
      introSeen().then(setSeen),
    )
  }, [])
  const { theme } = useUniwind()
  const background = useThemeColor('background')
  const foreground = useThemeColor('foreground')
  if (
    token === undefined ||
    seen === undefined ||
    (token && me === undefined)
  ) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }
  const page = segments[0] ?? ''
  const signedOutPage = ['welcome', 'sign-in', 'verify', 'two-factor'].includes(
    page,
  )
  if (!token || !me) {
    if (!signedOutPage)
      return <Redirect href={seen ? '/sign-in' : '/welcome'} />
  } else if (!me.onboarded) {
    if (page !== 'onboarding') return <Redirect href="/onboarding" />
  } else if (signedOutPage || page === 'onboarding') {
    return <Redirect href="/" />
  }
  return (
    <>
      <UpdatePrompt />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerTitleStyle: { fontFamily: 'Bricolage-Bold' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: background },
        }}
      >
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="verify" options={{ headerShown: false }} />
        <Stack.Screen name="two-factor" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="inbox" options={{ title: '' }} />
        <Stack.Screen name="discover" options={{ title: '' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Invite' }} />
        <Stack.Screen
          name="competitions/new"
          options={{ title: 'New competition' }}
        />
        <Stack.Screen name="c/[slug]" options={{ title: '' }} />
        <Stack.Screen name="p/[username]" options={{ title: '' }} />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
      </Stack>
    </>
  )
}
