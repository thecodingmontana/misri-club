import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * The sign-in and setup screens: the welcome photo behind, the headline over
 * it, and the form on a sheet that rises with the keyboard.
 */
export function AuthShell({
  title,
  lead,
  children,
}: {
  title: [string, string]
  lead: ReactNode
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <ImageBackground
      source={require('../assets/welcome/welcome-2.jpg')}
      resizeMode="cover"
      className="flex-1 bg-black"
      accessibilityIgnoresInvertColors
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.85)']}
        style={{ flex: 1 }}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerClassName="grow justify-end"
            keyboardShouldPersistTaps="handled"
          >
            <View
              className="gap-2 px-6 pb-6"
              style={{ paddingTop: insets.top + 48 }}
            >
              <Text className="font-display text-5xl uppercase leading-[46px] text-white">
                {title[0]}
                {'\n'}
                <Text className="text-accent">{title[1]}</Text>
              </Text>
              <Text className="font-normal text-base leading-6 text-white/80">
                {lead}
              </Text>
            </View>
            <View
              className="gap-4 rounded-t-[32px] bg-background px-6 pt-7"
              style={{ paddingBottom: insets.bottom + 24 }}
            >
              {children}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </ImageBackground>
  )
}

/** A refusal from the server, under the form. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Text
      className="font-normal text-sm text-danger"
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  )
}
