import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { Button, useThemeColor } from 'heroui-native'
import { useRef, useState } from 'react'
import {
  FlatList,
  ImageBackground,
  type ImageSourcePropType,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { markIntroSeen } from '@/lib/intro'

// Photos from Unsplash (downloaded through its API, credited on each slide).
const SLIDES: Array<{
  photo: ImageSourcePropType
  credit: string
  kicker: string
  title: string
  body: string
}> = [
  {
    photo: require('../../assets/welcome/welcome-1.jpg'),
    credit: 'Mesh',
    kicker: 'Competitions',
    title: 'Run your club’s chess',
    body: 'Leagues, knockouts, groups and 1v1 challenges. Share an invite link; fixtures, deadlines and the table look after themselves.',
  },
  {
    photo: require('../../assets/welcome/welcome-2.jpg'),
    credit: 'Eugene Chystiakov',
    kicker: 'Results',
    title: 'Results without the chasing',
    body: 'Play on chess.com and Misri finds your games. Over the board? Report the result and your opponent confirms it.',
  },
  {
    photo: require('../../assets/welcome/welcome-3.jpg'),
    credit: 'Dipesh Shrestha',
    kicker: 'Training',
    title: 'Sharpen up between rounds',
    body: 'Puzzles by theme, opening courses, famous master games and Stockfish, right on your phone.',
  },
]

/** First launch: what Misri is, three photo screens, then sign-in. */
export default function Welcome() {
  const insets = useSafeAreaInsets()
  const background = useThemeColor('background')
  const list = useRef<FlatList>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [page, setPage] = useState(0)
  const last = page === SLIDES.length - 1

  async function done() {
    await markIntroSeen()
    router.replace('/sign-in')
  }

  function go(next: number) {
    list.current?.scrollToOffset({ offset: next * size.width, animated: true })
    setPage(next)
  }

  return (
    <View
      className="flex-1 bg-background"
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      {size.width > 0 && (
        <FlatList
          ref={list}
          data={SLIDES}
          keyExtractor={(slide) => slide.title}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / size.width))
          }
          renderItem={({ item }) => (
            <ImageBackground
              source={item.photo}
              resizeMode="cover"
              style={{ width: size.width, height: size.height }}
              accessibilityIgnoresInvertColors
            >
              <LinearGradient
                colors={['transparent', background, background]}
                locations={[0.3, 0.62, 1]}
                style={{ flex: 1 }}
              >
                <View
                  className="flex-1 justify-end gap-3 px-7"
                  style={{ paddingBottom: insets.bottom + 150 }}
                >
                  <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
                    {item.kicker}
                  </Text>
                  <Text className="text-4xl font-bold leading-tight text-foreground">
                    {item.title}
                  </Text>
                  <Text className="text-base leading-6 text-muted">
                    {item.body}
                  </Text>
                </View>
              </LinearGradient>
              <Text
                className="absolute right-4 overflow-hidden rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/80"
                style={{ top: insets.top + 56 }}
              >
                Photo: {item.credit} / Unsplash
              </Text>
            </ImageBackground>
          )}
        />
      )}

      {/* over the slides: Skip, the page dots and the main button */}
      <View
        className="absolute right-4 left-4 flex-row justify-end"
        style={{ top: insets.top + 8 }}
      >
        {!last && (
          <Button variant="secondary" size="sm" onPress={done}>
            Skip
          </Button>
        )}
      </View>
      <View
        className="absolute right-0 left-0 gap-6 px-6"
        style={{ bottom: insets.bottom + 24 }}
      >
        <View className="flex-row justify-center gap-2">
          {SLIDES.map((slide, i) => (
            <View
              key={slide.title}
              className={`h-2 rounded-full ${
                i === page ? 'w-6 bg-accent' : 'w-2 bg-border'
              }`}
            />
          ))}
        </View>
        <Button size="lg" onPress={() => (last ? done() : go(page + 1))}>
          {last ? 'Get started' : 'Next'}
        </Button>
      </View>
    </View>
  )
}
