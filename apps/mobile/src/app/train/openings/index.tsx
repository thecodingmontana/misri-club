import { OPENINGS } from '@misri/core/openings'
import { router, Stack } from 'expo-router'
import { Card, Chip, PressableFeedback } from 'heroui-native'
import { ScrollView, Text, View } from 'react-native'
import { Kicker } from '@/competitions'
import { Screen } from '@/components'

/** The opening courses, as on the website: name, side and what it's about. */
export default function Openings() {
  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12">
        <View className="items-center gap-1">
          <Kicker>Train</Kicker>
          <Text className="font-display text-4xl uppercase text-foreground">
            Openings
          </Text>
          <Text className="font-normal text-center text-sm text-muted">
            Learn each line move by move, then drill it from memory.
          </Text>
        </View>
        {OPENINGS.map((course) => {
          const [title, variation] = course.name.split(': ')
          return (
            <Card key={course.slug} className="p-0">
              <PressableFeedback
                className="gap-1 px-4 py-3.5"
                onPress={() => router.push(`/train/openings/${course.slug}`)}
              >
                <View className="flex-row items-center gap-2">
                  <Text
                    numberOfLines={1}
                    className="flex-1 font-semibold text-base text-foreground"
                  >
                    {title}
                  </Text>
                  <Chip size="sm" variant="soft">
                    {course.side === 'white' ? 'White' : 'Black'}
                  </Chip>
                </View>
                {variation && (
                  <Text
                    numberOfLines={1}
                    className="font-normal text-xs text-muted"
                  >
                    {variation} · {course.eco}
                  </Text>
                )}
                <Text className="font-normal text-sm text-muted">
                  {course.summary}
                </Text>
              </PressableFeedback>
            </Card>
          )
        })}
      </ScrollView>
    </Screen>
  )
}
