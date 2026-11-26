import { FORMAT_LABEL } from '@misri/core/formats'
import { router } from 'expo-router'
import { Button } from 'heroui-native'
import { useState } from 'react'
import { View } from 'react-native'
import {
  CompetitionCard,
  type CompetitionSummary,
  EmptyCard,
  JoinButton,
  PageTitle,
} from '@/competitions'
import { Problem, Screen } from '@/components'
import { SelectField } from '@/form'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'
import { RefreshScroll } from '@/refresh'
import { CompetitionListSkeleton } from '@/skeletons'

const FILTERS = ['all', 'league', 'knockout', 'groups'] as const

/** Every public competition taking players, filtered by format. */
export default function Discover() {
  const { api } = useSession()
  const [format, setFormat] = useState<(typeof FILTERS)[number]>('all')
  const { data, error, reload } = useLoad(
    async () =>
      api ? ((await api.openCompetitions()) as CompetitionSummary[]) : null,
    String(Boolean(api)),
  )
  const shown =
    data && (format === 'all' ? data : data.filter((c) => c.format === format))

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
        <PageTitle
          title="Open competitions"
          lead="Public leagues and tournaments taking players right now."
        />
        <SelectField
          label="Format"
          value={format}
          options={FILTERS.map((value) => ({
            value,
            label: value === 'all' ? 'All formats' : FORMAT_LABEL[value],
          }))}
          onChange={setFormat}
        />
        {!shown ? (
          <CompetitionListSkeleton action />
        ) : shown.length === 0 ? (
          <View className="gap-3">
            <EmptyCard>
              {format === 'all'
                ? 'No public competitions are taking players right now.'
                : `No public ${format === 'groups' ? 'groups + knockout competitions' : `${FORMAT_LABEL[format].toLowerCase()}s`} are taking players right now.`}
            </EmptyCard>
            <Button
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/competitions/new',
                  params: { format: format === 'all' ? 'league' : format },
                })
              }
            >
              Start your own
            </Button>
          </View>
        ) : (
          shown.map((competition) => (
            <CompetitionCard
              key={competition.slug}
              competition={competition}
              action={<JoinButton slug={competition.slug} />}
            />
          ))
        )}
      </RefreshScroll>
    </Screen>
  )
}
