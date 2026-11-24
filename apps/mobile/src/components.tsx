import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import { useColors } from './lib/theme'

export function Screen({ children }: { children: ReactNode }) {
  const c = useColors()
  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {children}
    </View>
  )
}

export function Card({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const c = useColors()
  return (
    <View style={[styles.card, { backgroundColor: c.card }, style]}>
      {children}
    </View>
  )
}

export function Title({ children }: { children: ReactNode }) {
  const c = useColors()
  return <Text style={[styles.title, { color: c.text }]}>{children}</Text>
}

export function Muted({ children }: { children: ReactNode }) {
  const c = useColors()
  return <Text style={[styles.muted, { color: c.muted }]}>{children}</Text>
}

export function Body({ children }: { children: ReactNode }) {
  const c = useColors()
  return <Text style={[styles.body, { color: c.text }]}>{children}</Text>
}

export function Button({
  label,
  onPress,
  busy,
  variant = 'primary',
}: {
  label: string
  onPress: () => void
  busy?: boolean
  variant?: 'primary' | 'ghost'
}) {
  const c = useColors()
  const primary = variant === 'primary'
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? c.primary : 'transparent',
          opacity: pressed || busy ? 0.7 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? c.primaryText : c.text} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            { color: primary ? c.primaryText : c.text },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}

export function Loading() {
  const c = useColors()
  return (
    <View style={styles.center}>
      <ActivityIndicator color={c.primary} />
    </View>
  )
}

export function Problem({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <View style={[styles.center, { gap: 12 }]}>
      <Body>Couldn't load this</Body>
      <Muted>{message}</Muted>
      <Button label="Try again" onPress={onRetry} variant="ghost" />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: { borderRadius: 16, padding: 16, gap: 4 },
  title: { fontSize: 24, fontWeight: '700' },
  muted: { fontSize: 14 },
  body: { fontSize: 16 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
})
