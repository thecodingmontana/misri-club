import { router } from 'expo-router'
import { Button, useThemeColor } from 'heroui-native'
import { useRef, useState } from 'react'
import {
  FlatList,
  Image,
  type ImageSourcePropType,
  Pressable,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '@/icon'
import type { IconName } from '@/icons.generated'
import { markIntroSeen } from '@/lib/intro'

type Chip = { icon: IconName; label: string }

// Photos from Unsplash (downloaded through its API, credited on each slide).
const SLIDES: Array<{
  photo: ImageSourcePropType
  credit: string
  title: [string, string]
  lead: string
  rest: string
  chips: [Chip, Chip]
}> = [
  {
    photo: require('../../assets/welcome/welcome-1.jpg'),
    credit: 'Mesh',
    title: ['Run the', 'league.'],
    lead: 'Leagues, knockouts and 1v1s',
    rest: ' for your club. Share one invite code; fixtures, deadlines and the table look after themselves.',
    chips: [
      { icon: 'CalendarOutline', label: 'Round 3 due tomorrow' },
      { icon: 'UserPlus', label: 'Invite code KNG7Q2XR' },
    ],
  },
  {
    photo: require('../../assets/welcome/welcome-2.jpg'),
    credit: 'Eugene Chystiakov',
    title: ['We keep', 'the score.'],
    lead: 'Misri finds your chess.com games.',
    rest: ' Over the board? Report the result and your opponent confirms it.',
    chips: [
      { icon: 'CheckCircle', label: 'Result confirmed' },
      { icon: 'Trophy', label: '+3 points' },
    ],
  },
  {
    photo: require('../../assets/welcome/welcome-3.jpg'),
    credit: 'Dipesh Shrestha',
    title: ['Sharpen', 'your game.'],
    lead: 'Puzzles, openings and master games,',
    rest: ' with Stockfish running right on your phone.',
    chips: [
      { icon: 'Target', label: 'Puzzle solved' },
      { icon: 'Cpu', label: 'Stockfish 19' },
    ],
  },
]

/** First launch: what Misri is, in three screens, then sign-in. */
export default function Welcome() {
  const insets = useSafeAreaInsets()
  const onAccent = useThemeColor('accent-foreground')
  const list = useRef<FlatList>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const { width } = size
  const [page, setPage] = useState(0)
  const last = page === SLIDES.length - 1

  async function done() {
    await markIntroSeen()
    router.replace('/sign-in')
  }

  function go(next: number) {
    list.current?.scrollToOffset({ offset: next * width, animated: true })
    setPage(next)
  }

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
    >
      {/* progress: one bar per screen, filled up to this one */}
      <View className="flex-row items-center gap-2 px-6">
        {SLIDES.map((slide, i) => (
          <View
            key={slide.credit}
            className={`h-1 flex-1 rounded-full ${
              i <= page ? 'bg-foreground' : 'bg-border'
            }`}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={done}
          hitSlop={12}
          className="ml-3"
        >
          <Text
            className="font-strong text-sm text-muted"
            style={{ opacity: last ? 0 : 1 }}
          >
            Skip
          </Text>
        </Pressable>
      </View>

      {/* the slides get this area's measured size: a horizontal list gives none */}
      <View className="flex-1" onLayout={(e) => setSize(e.nativeEvent.layout)}>
        {width > 0 && (
          <FlatList
            ref={list}
            data={SLIDES}
            keyExtractor={(slide) => slide.credit}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setPage(Math.round(e.nativeEvent.contentOffset.x / width))
            }
            renderItem={({ item }) => (
              <View
                style={{ width, height: size.height }}
                className="gap-5 px-6 pt-6"
              >
                <Text className="font-display text-6xl uppercase leading-[56px] text-foreground">
                  {item.title[0]}
                  {'\n'}
                  <Text className="text-accent">{item.title[1]}</Text>
                </Text>

                {/* the photo, framed, with two moments from Misri floating on it */}
                <View className="flex-1 justify-center">
                  <View className="flex-1 overflow-hidden rounded-[32px] bg-surface">
                    <Image
                      source={item.photo}
                      resizeMode="cover"
                      className="size-full"
                      accessibilityIgnoresInvertColors
                    />
                    <Text className="absolute right-3 bottom-3 overflow-hidden rounded-full bg-black/45 px-2 py-0.5 font-body text-[10px] text-white">
                      Photo: {item.credit} / Unsplash
                    </Text>
                  </View>
                  <ChipView
                    chip={item.chips[0]}
                    className="absolute top-6 -left-1"
                  />
                  <ChipView
                    chip={item.chips[1]}
                    className="absolute -right-1 bottom-12"
                  />
                </View>

                <Text className="font-body text-base leading-6 text-muted">
                  <Text className="font-strong text-foreground">
                    {item.lead}
                  </Text>
                  {item.rest}
                </Text>
              </View>
            )}
          />
        )}
      </View>

      <View className="gap-3 px-6 pt-5">
        <Button size="lg" onPress={() => (last ? done() : go(page + 1))}>
          <Button.Label>{last ? 'Get started' : 'Next'}</Button.Label>
          <Icon name="ChevronRight" color={onAccent} />
        </Button>
        <Pressable accessibilityRole="link" onPress={done} hitSlop={8}>
          <Text className="text-center font-body text-sm text-muted">
            Already a member?{' '}
            <Text className="font-strong text-foreground">Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function ChipView({ chip, className }: { chip: Chip; className: string }) {
  return (
    <View
      className={`flex-row items-center gap-2 rounded-full bg-overlay px-3 py-2 shadow-lg ${className}`}
    >
      <Icon name={chip.icon} size={16} />
      <Text className="font-strong text-sm text-foreground">{chip.label}</Text>
    </View>
  )
}
