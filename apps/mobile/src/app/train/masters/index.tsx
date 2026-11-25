import { MASTER_GAMES, type Tag } from '@misri/core/masters'
import { router, Stack } from 'expo-router'
import { Card, Chip, PressableFeedback } from 'heroui-native'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Kicker } from '@/competitions'
import { Screen } from '@/components'

const TAGS = [...new Set(MASTER_GAMES.flatMap((game) => game.tags))] as Tag[]

/** Famous games to replay, filtered by theme, as on the website. */
export default function MasterGames() {
  const [tag, setTag] = useState<Tag | null>(null)
  const shown = tag
    ? MASTER_GAMES.filter((game) => game.tags.includes(tag))
    : MASTER_GAMES

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12">
        <View className="items-center gap-1">
          <Kicker>Train</Kicker>
          <Text className="font-display text-4xl uppercase text-foreground">
            Master games
          </Text>
          <Text className="font-normal text-center text-sm text-muted">
            Replay famous games, learn the key moves, guess them yourself.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Chip
            variant={tag === null ? 'soft' : 'tertiary'}
            color={tag === null ? 'accent' : 'default'}
            onPress={() => setTag(null)}
          >
            All
          </Chip>
          {TAGS.map((value) => (
            <Chip
              key={value}
              variant={tag === value ? 'soft' : 'tertiary'}
              color={tag === value ? 'accent' : 'default'}
              onPress={() => setTag(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </Chip>
          ))}
        </View>
        {shown.map((game) => (
          <Card key={game.slug} className="p-0">
            <PressableFeedback
              className="gap-1 px-4 py-3.5"
              onPress={() => router.push(`/train/masters/${game.slug}`)}
            >
              <View className="flex-row items-baseline justify-between gap-2">
                <Text className="flex-1 font-semibold text-base text-foreground">
                  {game.title}
                </Text>
                <Text className="font-normal text-xs text-muted">
                  {game.year}
                </Text>
              </View>
              <Text className="font-normal text-xs text-muted">
                {game.white} vs {game.black}
              </Text>
              <Text className="font-normal text-sm text-foreground">
                {game.description}
              </Text>
              <View className="mt-1 flex-row flex-wrap gap-1">
                {game.tags.map((t) => (
                  <Chip key={t} size="sm" variant="soft">
                    {t}
                  </Chip>
                ))}
              </View>
            </PressableFeedback>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  )
}
