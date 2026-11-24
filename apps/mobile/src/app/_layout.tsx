import '../global.css'
import { Redirect, Stack, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { HeroUINativeProvider, useThemeColor } from 'heroui-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Loading, Screen } from '@/components'
import { SessionProvider, useSession } from '@/lib/session'

export default function RootLayout() {
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

/** Signed out: only the sign-in screen. Signed in: everything else. */
function Gate() {
  const { token } = useSession()
  const segments = useSegments()
  const background = useThemeColor('background')
  const foreground = useThemeColor('foreground')
  if (token === undefined) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }
  const onSignIn = segments[0] === 'sign-in'
  if (!token && !onSignIn) return <Redirect href="/sign-in" />
  if (token && onSignIn) return <Redirect href="/" />
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
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ title: 'Misri' }} />
        <Stack.Screen name="c/[slug]" options={{ title: '' }} />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
      </Stack>
    </>
  )
}
