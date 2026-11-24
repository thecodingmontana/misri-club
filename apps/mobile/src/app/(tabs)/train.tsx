import { Card, Chip, PressableFeedback } from 'heroui-native'
import { ScrollView, Text, View } from 'react-native'
import { IconBadge, Kicker, PageTitle } from '@/competitions'
import { Screen } from '@/components'
import type { IconName } from '@/icon'

// The website's Train modes (apps/web/src/routes/train.index.tsx).
const MODES: Array<{
  icon: IconName
  title: string
  description: string
}> = [
  {
    icon: 'Lightbulb',
    title: 'Puzzles',
    description: 'Endless tactics from Lichess. Find the best move.',
  },
  {
    icon: 'Fire',
    title: 'Brilliant moves',
    description:
      'How to spot sacrifices and killer moves, with master examples.',
  },
  {
    icon: 'Target',
    title: 'Analyse your games',
    description:
      'Stockfish checks your latest chess.com games for blunders and accuracy.',
  },
  {
    icon: 'Cpu',
    title: 'Play Stockfish',
    description: 'A full game against the engine, from Beginner to Max.',
  },
  {
    icon: 'Book',
    title: 'Openings',
    description:
      'Learn the Italian, Queen’s Gambit, Sicilian and more, then drill them.',
  },
  {
    icon: 'Trophy',
    title: 'Master games',
    description:
      'Replay famous games, learn the key moves, guess them yourself.',
  },
]

/**
 * Train, laid out like the website's. The board and Stockfish come to the app
 * next (MIS-80); until then each mode says so rather than going nowhere.
 */
export default function Train() {
  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 p-4">
        <View className="items-center gap-1">
          <Kicker>Practice</Kicker>
          <PageTitle title="Train" lead="How do you want to train today?" />
        </View>
        <View className="gap-3">
          {MODES.map((mode) => (
            <Card key={mode.title} className="p-0">
              <PressableFeedback
                className="flex-row items-center gap-4 px-4 py-4"
                isDisabled
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
                <Chip size="sm" variant="soft">
                  Soon
                </Chip>
              </PressableFeedback>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  )
}
