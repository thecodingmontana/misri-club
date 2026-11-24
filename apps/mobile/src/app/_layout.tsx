import '../web-preview'
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
 * Signed out: the welcome screens (first launch), then sign-in.
 * Signed in: everything else.
 */
function Gate() {
  const { token } = useSession()
  const segments = useSegments()
  const [seen, setSeen] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    void introSeen().then(setSeen)
  }, [])
  const background = useThemeColor('background')
  const foreground = useThemeColor('foreground')
  if (token === undefined || seen === undefined) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }
  const signedOutPage = segments[0] === 'sign-in' || segments[0] === 'welcome'
  if (!token && !signedOutPage) {
    return <Redirect href={seen ? '/sign-in' : '/welcome'} />
  }
  if (token && signedOutPage) return <Redirect href="/" />
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: background },
        }}
      >
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ title: 'Misri' }} />
        <Stack.Screen name="c/[slug]" options={{ title: '' }} />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
      </Stack>
    </>
  )
}
