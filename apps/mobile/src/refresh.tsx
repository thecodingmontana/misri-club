import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { Spinner, useThemeColor } from 'heroui-native'
import { type ReactNode, useState } from 'react'
import { Platform, ScrollView, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Icon } from '@/icon'

const TRIGGER = 72 // pull this far to refresh
const HOLD = 52 // where the content waits while it refreshes
const MAX = 140
const SPRING = { damping: 18, stiffness: 180 }

type Phase = 'idle' | 'refreshing' | 'done' | 'failed'

/**
 * A ScrollView with the club's own pull-to-refresh: three dots fill in as you
 * pull, a spinner while it loads, then "Up to date" (or "Couldn't refresh")
 * under a soft glow before the page settles back.
 */
export function RefreshScroll({
  onRefresh,
  children,
  contentContainerClassName,
}: {
  /** resolves false when the refresh failed */
  onRefresh: () => Promise<boolean>
  children: ReactNode
  contentContainerClassName?: string
}) {
  const [accent, danger] = useThemeColor(['accent', 'danger'])
  const pull = useSharedValue(0)
  const scrollY = useSharedValue(0)
  const armed = useSharedValue(false)
  const busy = useSharedValue(false)
  const [phase, setPhase] = useState<Phase>('idle')

  const tick = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {})
  }

  async function refresh() {
    setPhase('refreshing')
    const ok = await Promise.resolve(onRefresh()).catch(() => false)
    setPhase(ok === false ? 'failed' : 'done')
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(
        ok === false
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Success,
      ).catch(() => {})
    }
    setTimeout(() => {
      pull.value = withSpring(0, SPRING)
      busy.value = false
      setTimeout(() => setPhase('idle'), 250)
    }, 900)
  }

  const native = Gesture.Native()
  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    // once active it cancels the press of the card under the finger (Android)
    .simultaneousWithExternalGesture(native)
    .onChange((e) => {
      if (busy.value) return
      // only at the top: a downward drag pulls, an upward one gives it back
      if (scrollY.value > 0 && pull.value === 0) return
      const resistance = 1 - pull.value / (MAX * 1.6)
      pull.value = Math.min(
        MAX,
        Math.max(0, pull.value + e.changeY * 0.55 * resistance),
      )
      const ready = pull.value >= TRIGGER
      if (ready !== armed.value) {
        armed.value = ready
        if (ready) runOnJS(tick)()
      }
    })
    .onEnd(() => {
      if (busy.value) return
      if (armed.value) {
        busy.value = true
        armed.value = false
        pull.value = withSpring(HOLD, SPRING)
        runOnJS(refresh)()
      } else {
        pull.value = withSpring(0, SPRING)
      }
    })

  const content = useAnimatedStyle(() => ({
    transform: [{ translateY: pull.value }],
  }))
  const header = useAnimatedStyle(() => ({ height: pull.value }))

  return (
    <View className="flex-1">
      {phase === 'done' && (
        <Animated.View
          pointerEvents="none"
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(400)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 180,
          }}
        >
          {/* the accent fading out: hex colours take a two-digit alpha */}
          <LinearGradient
            colors={[`${accent}33`, `${accent}00`]}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          },
          header,
        ]}
      >
        {phase === 'idle' && (
          <View className="flex-row gap-1.5">
            {[0, 1, 2].map((i) => (
              <Dot key={i} index={i} pull={pull} color={accent} />
            ))}
          </View>
        )}
        {phase === 'refreshing' && (
          <Animated.View entering={FadeIn.duration(150)}>
            <Spinner size="sm" />
          </Animated.View>
        )}
        {(phase === 'done' || phase === 'failed') && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
          >
            <View className="flex-row items-center gap-1.5">
              <Icon
                name={phase === 'done' ? 'CheckCircle' : 'XCircle'}
                size={16}
                color={phase === 'done' ? accent : danger}
              />
              <Text
                className={`font-medium text-xs ${phase === 'done' ? 'text-accent' : 'text-danger'}`}
              >
                {phase === 'done' ? 'Up to date' : "Couldn't refresh"}
              </Text>
            </View>
          </Animated.View>
        )}
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, content]}>
          <GestureDetector gesture={native}>
            <ScrollView
              onScroll={(e) => {
                scrollY.value = e.nativeEvent.contentOffset.y
              }}
              scrollEventThrottle={16}
              overScrollMode="never"
              bounces={false}
              contentContainerClassName={contentContainerClassName}
            >
              {children}
            </ScrollView>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

/** One of the three dots; each fills in a third of the way further along. */
function Dot({
  index,
  pull,
  color,
}: {
  index: number
  pull: SharedValue<number>
  color: string
}) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(
      pull.value,
      [(TRIGGER * index) / 3, (TRIGGER * (index + 1)) / 3],
      [0, 1],
      'clamp',
    )
    return { opacity: 0.25 + p * 0.75, transform: [{ scale: 0.6 + p * 0.4 }] }
  })
  return (
    <Animated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: color },
        style,
      ]}
    />
  )
}
