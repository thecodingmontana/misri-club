import '../global.css'
import { useFonts } from 'expo-font'
import { Redirect, Stack, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { HeroUINativeProvider, useThemeColor } from 'heroui-native'
import { useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Loading, Screen } from '@/components'
import { introSeen } from '@/lib/intro'
import { SessionProvider, useSession } from '@/lib/session'

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
  const { token, me } = useSession()
  const segments = useSegments()
  const [seen, setSeen] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    void introSeen().then(setSeen)
  }, [])
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
      <StatusBar style="auto" />
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
        <Stack.Screen name="account" options={{ title: 'Account' }} />
      </Stack>
    </>
  )
}
