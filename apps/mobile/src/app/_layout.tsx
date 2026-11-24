import { Redirect, Stack, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Loading, Screen } from '@/components'
import { SessionProvider, useSession } from '@/lib/session'
import { useColors } from '@/lib/theme'

export default function RootLayout() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  )
}

/** Signed out: only the sign-in screen. Signed in: everything else. */
function Gate() {
  const { token } = useSession()
  const segments = useSegments()
  const c = useColors()
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
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.background },
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
