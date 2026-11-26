import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { Button, useThemeColor } from 'heroui-native'
import { useRef, useState } from 'react'
import {
  FlatList,
  ImageBackground,
  type ImageSourcePropType,
  Pressable,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '@/icon'
import { markIntroSeen } from '@/lib/intro'

// Photos from Unsplash (downloaded through its API, credited on each slide).
const SLIDES: Array<{
  photo: ImageSourcePropType
  credit: string
  title: [string, string]
  lead: string
  rest: string
}> = [
  {
    photo: require('../../assets/welcome/welcome-1.jpg'),
    credit: 'Mesh',
    title: ['Run the', 'league.'],
    lead: 'Leagues, knockouts and 1v1s',
    rest: ' for your club. Share one invite code; fixtures, deadlines and the table look after themselves.',
  },
  {
    photo: require('../../assets/welcome/welcome-2.jpg'),
    credit: 'Eugene Chystiakov',
    title: ['We keep', 'the score.'],
    lead: 'Misri finds your chess.com games.',
    rest: ' Over the board? Report the result and your opponent confirms it.',
  },
  {
    photo: require('../../assets/welcome/welcome-3.jpg'),
    credit: 'Dipesh Shrestha',
    title: ['Sharpen', 'your game.'],
    lead: 'Puzzles, openings and master games,',
    rest: ' with Stockfish running right on your phone.',
  },
]

/** First launch: what Misri is, in three full-screen photos, then sign-in. */
export default function Welcome() {
  const insets = useSafeAreaInsets()
  const onAccent = useThemeColor('accent-foreground')
  const list = useRef<FlatList>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [page, setPage] = useState(0)
  const last = page === SLIDES.length - 1

  async function done() {
    await markIntroSeen()
    router.replace('/sign-in')
  }

  return (
    <View
      className="flex-1 bg-black"
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      {size.width > 0 && (
        <FlatList
          ref={list}
          data={SLIDES}
          keyExtractor={(slide) => slide.credit}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / size.width))
          }
          renderItem={({ item }) => (
            <ImageBackground
              source={item.photo}
              resizeMode="cover"
              style={{ width: size.width, height: size.height }}
              accessibilityIgnoresInvertColors
            >
              {/* darker at the top and bottom, so the words read on any photo */}
              <LinearGradient
                colors={[
                  'rgba(0,0,0,0.45)',
                  'rgba(0,0,0,0.1)',
                  'rgba(0,0,0,0.6)',
                  'rgba(0,0,0,0.9)',
                ]}
                locations={[0, 0.2, 0.5, 1]}
                style={{
                  flex: 1,
                  paddingTop: insets.top + 44,
                  paddingBottom: insets.bottom + 132,
                }}
                className="justify-end px-6"
              >
                <View className="gap-3">
                  <Text className="font-display text-6xl uppercase leading-[56px] text-white">
                    {item.title[0]}
                    {'\n'}
                    <Text className="text-accent">{item.title[1]}</Text>
                  </Text>
                  <Text className="font-normal text-base leading-6 text-white/80">
                    <Text className="font-bold text-white">{item.lead}</Text>
                    {item.rest}
                  </Text>
                  <Text className="font-normal text-2xs text-white/50">
                    Photo: {item.credit} / Unsplash
                  </Text>
                </View>
              </LinearGradient>
            </ImageBackground>
          )}
        />
      )}

      {/* over the photos: progress and Skip, then the main button */}
      <View
        className="absolute right-0 left-0 flex-row items-center gap-2 px-6"
        style={{ top: insets.top + 12 }}
      >
        {SLIDES.map((slide, i) => (
          <View
            key={slide.credit}
            className={`h-1 flex-1 rounded-full ${
              i <= page ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={done}
          hitSlop={12}
          className="ml-3"
          disabled={last}
        >
          <Text
            className="font-bold text-sm text-white"
            style={{ opacity: last ? 0 : 1 }}
          >
            Skip
          </Text>
        </Pressable>
      </View>

      <View
        className="absolute right-0 left-0 gap-3 px-6"
        style={{ bottom: insets.bottom + 20 }}
      >
        {/* swipe between the screens; the button only on the last */}
        {last && (
          <Button size="lg" onPress={done}>
            <Button.Label>Get started</Button.Label>
            <Icon name="ChevronRight" color={onAccent} />
          </Button>
        )}
        <Pressable accessibilityRole="link" onPress={done} hitSlop={8}>
          <Text className="text-center font-normal text-sm text-white/70">
            Already a member?{' '}
            <Text className="font-bold text-white">Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
