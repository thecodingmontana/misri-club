import { CREATE_CHOICES } from '@misri/core/formats'
import { router } from 'expo-router'
import { Button, Card, PressableFeedback, useThemeColor } from 'heroui-native'
import { Text, View } from 'react-native'
import {
  CompetitionCard,
  type CompetitionSummary,
  EmptyCard,
  OpenCompetitions,
  PageTitle,
} from '@/competitions'
import { Problem, Screen } from '@/components'
import { Icon } from '@/icon'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'
import { RefreshScroll } from '@/refresh'
import { CompetitionListSkeleton } from '@/skeletons'

/**
 * Home: your competitions first. Only someone in none gets the ways to start
 * (the Create tab always has them), then the open competitions.
 */
export default function Home() {
  const { api, me } = useSession()
  const accent = useThemeColor('accent')
  const { data, error, reload } = useLoad(
    async () => {
      if (!api) return null
      const [mine, open] = await Promise.all([
        api.myCompetitions(),
        api.openCompetitions(),
      ])
      return {
        mine: mine as CompetitionSummary[],
        open: open as CompetitionSummary[],
      }
    },
    String(Boolean(api)),
  )

  if (error && !data) {
    return (
      <Screen>
        <Problem message={error} onRetry={reload} />
      </Screen>
    )
  }

  return (
    <Screen>
      <RefreshScroll contentContainerClassName="gap-5 p-4" onRefresh={reload}>
        {me && !me.chessUsername && (
          <Card className="p-0">
            <PressableFeedback
              className="px-4 py-3"
              onPress={() => router.push('/account')}
            >
              <Text className="font-normal text-sm text-muted">
                <Text className="font-semibold text-foreground">
                  Play on chess.com?{' '}
                </Text>
                Link your account to join chess.com competitions and analyse
                your games.
              </Text>
            </PressableFeedback>
          </Card>
        )}
        <PageTitle title="Your competitions" />

        {!data ? (
          <CompetitionListSkeleton />
        ) : (
          <>
            <View className="gap-3">
              {data.mine.length === 0 ? (
                <>
                  <EmptyCard>
                    You're not in any competitions yet. Create one or join with
                    a code.
                  </EmptyCard>
                  <View className="gap-3">
                    {CREATE_CHOICES.map((choice) => (
                      <Button
                        key={choice.format}
                        variant="secondary"
                        className="justify-start"
                        onPress={() =>
                          router.push({
                            pathname: '/competitions/new',
                            params: { format: choice.format },
                          })
                        }
                      >
                        <Icon name="Plus" size={20} color={accent} />
                        <Button.Label>{choice.title}</Button.Label>
                      </Button>
                    ))}
                    <Button
                      variant="secondary"
                      className="justify-start"
                      onPress={() => router.push('/join')}
                    >
                      <Icon name="UserPlus" size={20} color={accent} />
                      <Button.Label>Join with a code</Button.Label>
                    </Button>
                  </View>
                </>
              ) : (
                data.mine.map((competition) => (
                  <CompetitionCard
                    key={competition.slug}
                    competition={competition}
                  />
                ))
              )}
            </View>
            <OpenCompetitions competitions={data.open} />
          </>
        )}
      </RefreshScroll>
    </Screen>
  )
}
