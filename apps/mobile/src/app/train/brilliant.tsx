import { BRILLIANCIES, CHECKLIST, PRACTICE } from '@misri/core/brilliant'
import { THEMES } from '@misri/core/puzzle'
import { router, Stack } from 'expo-router'
import { Button, Card, PressableFeedback, useThemeColor } from 'heroui-native'
import { ScrollView, Text, View } from 'react-native'
import { Kicker } from '@/competitions'
import { Screen } from '@/components'
import { Icon } from '@/icon'

/** How to find brilliant moves: the idea, a checklist, the masters' best, practice. */
export default function Brilliant() {
  const accent = useThemeColor('accent')
  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-12">
        <View className="items-center gap-1">
          <Kicker>Train</Kicker>
          <Text className="font-display text-center text-4xl uppercase text-foreground">
            Brilliant moves
          </Text>
        </View>

        <Card>
          <Card.Body className="gap-2">
            <View className="flex-row items-center gap-2">
              <Icon name="Lightbulb" size={20} color={accent} />
              <Text className="font-semibold text-sm text-foreground">
                What makes a move brilliant
              </Text>
            </View>
            <Text className="font-normal text-sm text-foreground">
              A brilliant move, marked !!, is the best move in the position and
              a hard one to find. Usually it gives up material, a piece, a rook
              or the queen, for an attack or a mate that wins more back.
              Sometimes it is a quiet move nobody expects. Analysis tools only
              call a move brilliant when it really is best: a sacrifice that
              does not work is just a blunder.
            </Text>
          </Card.Body>
        </Card>

        <View className="gap-2">
          <Text className="font-display text-xl uppercase text-foreground">
            How to find them
          </Text>
          {CHECKLIST.map((step, index) => (
            <Card key={step.title}>
              <Card.Body className="flex-row gap-3">
                <View className="size-7 items-center justify-center rounded-full bg-accent/15">
                  <Text className="font-semibold text-sm text-foreground">
                    {index + 1}
                  </Text>
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="font-semibold text-sm text-foreground">
                    {step.title}
                  </Text>
                  <Text className="font-normal text-sm text-muted">
                    {step.text}
                  </Text>
                </View>
              </Card.Body>
            </Card>
          ))}
        </View>

        <View className="gap-2">
          <Text className="font-display text-xl uppercase text-foreground">
            Brilliancies from the masters
          </Text>
          {BRILLIANCIES.map(({ game, note, ply }) => (
            <Card key={`${game.slug}-${ply}`} className="p-0">
              <PressableFeedback
                className="flex-row items-center gap-3 px-4 py-3"
                onPress={() =>
                  router.push({
                    pathname: '/train/masters/[slug]',
                    params: { slug: game.slug, ply: String(ply) },
                  })
                }
              >
                <View className="flex-1 gap-0.5">
                  <Text className="font-semibold text-sm text-foreground">
                    {note.move}!! · {game.title}, {game.year}
                  </Text>
                  <Text className="font-normal text-xs text-muted">
                    {note.text}
                  </Text>
                </View>
                <Icon name="ChevronRight" size={16} />
              </PressableFeedback>
            </Card>
          ))}
        </View>

        <View className="gap-2">
          <Text className="font-display text-xl uppercase text-foreground">
            Practise the ideas
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PRACTICE.map((theme) => (
              <Button
                key={theme}
                variant="secondary"
                className="grow basis-[45%]"
                onPress={() =>
                  router.push({
                    pathname: '/train/puzzles',
                    params: { theme },
                  })
                }
              >
                {THEMES[theme]}
              </Button>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}
