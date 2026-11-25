import {
  FORMAT_INFO,
  FORMAT_LABEL,
  STATUS_LABEL,
  scoringSummary,
} from '@misri/core/formats'
import { timeControlLabel } from '@misri/core/time-control'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Alert, Button, Card } from 'heroui-native'
import { ScrollView, Text, View } from 'react-native'
import { FormatExplainer, IconBadge, JoinButton, Kicker } from '@/competitions'
import { Loading, Problem, Screen } from '@/components'
import { formatDate } from '@/lib/format'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'

/** An invite (code or link): what you're joining, then Join or Decline. */
export default function Invite() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { api } = useSession()
  const {
    data: invite,
    error,
    loading,
    reload,
  } = useLoad(
    () => (api ? api.invite(code) : Promise.resolve(undefined)),
    `${Boolean(api)}:${code}`,
  )

  if (error && !invite) {
    return (
      <Screen>
        <Problem message={error} onRetry={reload} />
      </Screen>
    )
  }
  if (loading && !invite) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }
  if (!invite) {
    return (
      <Screen>
        <Problem message="No competition has that code." onRetry={reload} />
      </Screen>
    )
  }

  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`
  const facts: Array<[string, string]> = [
    ['Organiser', invite.organiser],
    [
      'Format',
      invite.legs === 2
        ? `${FORMAT_LABEL[invite.format]}, home & away`
        : FORMAT_LABEL[invite.format],
    ],
    ['Time control', timeControlLabel(invite.timeControl)],
    ...(invite.status === 'open' && invite.startsAt
      ? ([['Starts', formatDate(invite.startsAt)]] as Array<[string, string]>)
      : []),
    [
      'Players',
      invite.maxPlayers
        ? `${invite.members} of ${invite.maxPlayers}`
        : String(invite.members),
    ],
    ['Status', STATUS_LABEL[invite.status]],
    [
      'Time to play',
      invite.format === 'challenge'
        ? `Best of ${invite.bestOf}, ${days(invite.matchdayDays)} for every game`
        : `${days(invite.matchdayDays)} per round`,
    ],
    [
      'Joining',
      invite.requireApproval
        ? 'The organiser approves each player'
        : 'Straight in',
    ],
  ]

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerClassName="gap-5 p-4">
        <Card>
          <Card.Body className="gap-5 py-2">
            <View className="items-center gap-3">
              <IconBadge name="Trophy" size={56} />
              <Kicker>
                {invite.isMember ? "You're in" : "You're invited to"}
              </Kicker>
              <Text className="font-display text-center text-3xl uppercase text-foreground">
                {invite.name}
              </Text>
              <Text className="font-normal text-center text-sm text-muted">
                {FORMAT_INFO[invite.format].summary}
              </Text>
            </View>

            <View className="rounded-2xl bg-background px-3">
              {facts.map(([label, value], i) => (
                <View
                  key={label}
                  className={`flex-row justify-between gap-4 py-2.5 ${i ? 'border-t border-border' : ''}`}
                >
                  <Text className="font-normal text-sm text-muted">
                    {label}
                  </Text>
                  <Text className="flex-1 text-right font-medium text-sm text-foreground">
                    {value}
                  </Text>
                </View>
              ))}
            </View>
            <Text className="font-normal text-xs text-muted">
              {scoringSummary(
                invite.format,
                invite.unplayedRule,
                invite.points,
              )}
            </Text>

            {invite.isMember ? (
              <Button
                size="lg"
                onPress={() => router.replace(`/c/${invite.slug}`)}
              >
                Open the competition
              </Button>
            ) : invite.requested ? (
              <Alert status="accent">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    Request sent. Waiting for the organiser.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : !invite.canJoin ? (
              <View className="gap-3">
                <Text className="font-normal text-center text-sm text-muted">
                  {invite.reason}
                </Text>
                <Button
                  variant="secondary"
                  onPress={() => router.replace(`/c/${invite.slug}`)}
                >
                  See the competition
                </Button>
              </View>
            ) : (
              <View className="gap-2">
                <JoinButton
                  code={code}
                  size="lg"
                  label={invite.requireApproval ? 'Ask to join' : 'Join'}
                />
                <Button variant="ghost" size="lg" onPress={() => router.back()}>
                  Decline
                </Button>
              </View>
            )}
          </Card.Body>
        </Card>
        <FormatExplainer format={invite.format} />
      </ScrollView>
    </Screen>
  )
}
