import { router } from 'expo-router'
import { Button } from 'heroui-native'
import { useRef, useState } from 'react'
import { FlatList, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon } from '@/icon'
import type { IconName } from '@/icons.generated'
import { markIntroSeen } from '@/lib/intro'

const SLIDES: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'Trophy',
    title: 'Run your club’s chess',
    body: 'Leagues, knockouts, groups and 1v1 challenges. Share an invite link and the fixtures, deadlines and table look after themselves.',
  },
  {
    icon: 'CheckCircle',
    title: 'Results without the chasing',
    body: 'Play on chess.com and Misri finds your games. Playing over the board? Report the result and your opponent confirms it.',
  },
  {
    icon: 'TrainFilled',
    title: 'Train between rounds',
    body: 'Puzzles by theme, opening courses, famous master games and Stockfish, all running on your phone.',
  },
]

/** First launch: what Misri is, three screens, then sign-in. */
export default function Welcome() {
  const { width } = useWindowDimensions()
  const list = useRef<FlatList>(null)
  const [page, setPage] = useState(0)
  const last = page === SLIDES.length - 1

  async function done() {
    await markIntroSeen()
    router.replace('/sign-in')
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row justify-end px-4 pt-2">
        {!last && (
          <Button variant="ghost" size="sm" onPress={done}>
            Skip
          </Button>
        )}
      </View>
      <FlatList
        ref={list}
        data={SLIDES}
        keyExtractor={(slide) => slide.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setPage(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <View style={{ width }} className="flex-1 justify-center gap-5 px-8">
            <View className="size-24 items-center justify-center rounded-3xl bg-surface">
              <Icon name={item.icon} size={52} />
            </View>
            <Text className="text-3xl font-bold text-foreground">
              {item.title}
            </Text>
            <Text className="text-base leading-6 text-muted">{item.body}</Text>
          </View>
        )}
      />
      <View className="gap-6 px-6 pb-6">
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
        <Button
          size="lg"
          onPress={() => {
            if (last) return void done()
            list.current?.scrollToIndex({ index: page + 1 })
            setPage(page + 1)
          }}
        >
          {last ? 'Get started' : 'Next'}
        </Button>
      </View>
    </SafeAreaView>
  )
}
