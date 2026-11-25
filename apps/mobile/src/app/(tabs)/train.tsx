import { router } from 'expo-router'
import { Card, Chip, PressableFeedback, useThemeColor } from 'heroui-native'
import { ScrollView, Text, View } from 'react-native'
import { IconBadge, Kicker, PageTitle } from '@/competitions'
import { Screen } from '@/components'
import { Icon, type IconName } from '@/icon'

// The website's Train modes (apps/web/src/routes/train.index.tsx).
const MODES: Array<{
  icon: IconName
  title: string
  description: string
  /** where it opens; until a mode has one it says "Soon" */
  href?: string
}> = [
  {
    icon: 'Lightbulb',
    title: 'Puzzles',
    description: 'Endless tactics from Lichess. Find the best move.',
    href: '/train/puzzles',
  },
  {
    icon: 'Fire',
    title: 'Brilliant moves',
    description:
      'How to spot sacrifices and killer moves, with master examples.',
    href: '/train/brilliant',
  },
  {
    icon: 'Target',
    title: 'Analyse your games',
    description:
      'Stockfish checks your latest chess.com games for blunders and accuracy.',
    href: '/train/analysis',
  },
  {
    icon: 'Cpu',
    title: 'Play Stockfish',
    description: 'A full game against the engine, from Beginner to Max.',
    href: '/train/play',
  },
  {
    icon: 'Book',
    title: 'Openings',
    description:
      'Learn the Italian, Queen’s Gambit, Sicilian and more, then drill them.',
    href: '/train/openings',
  },
  {
    icon: 'Trophy',
    title: 'Master games',
    description:
      'Replay famous games, learn the key moves, guess them yourself.',
    href: '/train/masters',
  },
]

/** Train, laid out like the website's: progress first, then the modes. */
export default function Train() {
  const onAccent = useThemeColor('accent-foreground')
  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 p-4">
        <View className="items-center gap-1">
          <Kicker>Practice</Kicker>
          <PageTitle title="Train" lead="How do you want to train today?" />
        </View>
        <PressableFeedback
          onPress={() => router.push('/train/progress')}
          className="flex-row items-center gap-3 rounded-2xl bg-accent px-4 py-3"
        >
          <Icon name="Target" size={20} color={onAccent} />
          <Text className="flex-1 font-semibold text-sm text-accent-foreground">
            Your progress: streak, themes and records
          </Text>
          <Icon name="ChevronRight" size={16} color={onAccent} />
        </PressableFeedback>
        <View className="gap-3">
          {MODES.map((mode) => (
            <Card key={mode.title} className="p-0">
              <PressableFeedback
                className="flex-row items-center gap-4 px-4 py-4"
                isDisabled={!mode.href}
                onPress={() => mode.href && router.push(mode.href as never)}
              >
                <IconBadge name={mode.icon} size={48} />
                <View className="flex-1 gap-0.5">
                  <Text className="font-semibold text-base text-foreground">
                    {mode.title}
                  </Text>
                  <Text className="font-normal text-xs text-muted">
                    {mode.description}
                  </Text>
                </View>
                {!mode.href && (
                  <Chip size="sm" variant="soft">
                    Soon
                  </Chip>
                )}
              </PressableFeedback>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  )
}
