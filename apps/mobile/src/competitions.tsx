import {
  CREATE_CHOICES,
  FORMAT_INFO,
  FORMAT_LABEL,
  STATUS_LABEL,
} from '@misri/core/formats'
import { timeControlLabel } from '@misri/core/time-control'
import { router } from 'expo-router'
import {
  Accordion,
  Button,
  Card,
  PressableFeedback,
  Spinner,
  useThemeColor,
} from 'heroui-native'
import { type ReactNode, useState } from 'react'
import { Text, View } from 'react-native'
import { FormError } from '@/auth-shell'
import { Icon, type IconName } from '@/icon'
import { useSession } from '@/lib/session'
import { play } from '@/lib/sound'

export type CompetitionSummary = {
  slug: string
  name: string
  format: keyof typeof FORMAT_LABEL
  status: keyof typeof STATUS_LABEL
  members: number
  timeControl: string
}

/** The round tinted badge the website puts beside list items. */
export function IconBadge({
  name,
  size = 44,
}: {
  name: IconName
  size?: number
}) {
  const accent = useThemeColor('accent')
  return (
    <View
      className="items-center justify-center rounded-2xl bg-accent/15"
      style={{ width: size, height: size }}
    >
      <Icon name={name} size={size / 2.2} color={accent} />
    </View>
  )
}

/** A page heading in the display face, centred like the website's. */
export function PageTitle({ title, lead }: { title: string; lead?: string }) {
  return (
    <View className="items-center gap-1">
      <Text className="font-display text-4xl uppercase text-foreground">
        {title}
      </Text>
      {lead && (
        <Text className="font-normal text-center text-xs text-muted">
          {lead}
        </Text>
      )}
    </View>
  )
}

/** Small uppercase label over a section. */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <Text className="font-semibold text-xs uppercase tracking-widest text-muted">
      {children}
    </Text>
  )
}

/** Muted text in a card, for empty lists. */
export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <Card.Body>
        <Text className="font-normal text-center text-sm text-muted">
          {children}
        </Text>
      </Card.Body>
    </Card>
  )
}

/** One competition in a list: name, format, players and where it stands. */
export function CompetitionCard({
  competition,
  action,
}: {
  competition: CompetitionSummary
  action?: ReactNode
}) {
  const facts = [
    FORMAT_LABEL[competition.format],
    ...(competition.timeControl !== 'any'
      ? [timeControlLabel(competition.timeControl)]
      : []),
    `${competition.members} ${competition.members === 1 ? 'player' : 'players'}`,
    STATUS_LABEL[competition.status],
  ]
  return (
    <Card className="flex-row items-center gap-3 px-4 py-3.5">
      <PressableFeedback
        className="flex-1 flex-row items-center gap-3"
        onPress={() => router.push(`/c/${competition.slug}`)}
        accessibilityRole="link"
      >
        <IconBadge name="Trophy" />
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className="font-semibold text-base text-foreground"
          >
            {competition.name}
          </Text>
          <Text numberOfLines={2} className="font-normal text-xs text-muted">
            {facts.join(' · ')}
          </Text>
        </View>
        {!action && <Chevron />}
      </PressableFeedback>
      {action}
    </Card>
  )
}

/** Join a public competition (or with an invite code) in one press, then open it. */
export function JoinButton({
  slug,
  code,
  label = 'Join',
  size = 'sm',
}: {
  slug?: string
  code?: string
  label?: string
  size?: 'sm' | 'lg'
}) {
  const { api } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <View className="gap-2">
      <Button
        size={size}
        isDisabled={busy || !api}
        onPress={async () => {
          if (!api) return
          setBusy(true)
          setError(null)
          try {
            const result = await api.act(
              'joinCompetition',
              code ? { code } : { slug: slug as string },
            )
            play('success')
            router.replace(`/c/${result.slug}`)
          } catch (cause) {
            setError((cause as Error).message)
            setBusy(false)
          }
        }}
      >
        {busy ? <Spinner size="sm" /> : <Button.Label>{label}</Button.Label>}
      </Button>
      <FormError message={error} />
    </View>
  )
}

/** Public competitions you could join right now. */
export function OpenCompetitions({
  competitions,
}: {
  competitions: CompetitionSummary[]
}) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Kicker>Open competitions</Kicker>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => router.push('/discover')}
        >
          See all
        </Button>
      </View>
      {competitions.length === 0 ? (
        <EmptyCard>
          No public competitions are taking players right now.
        </EmptyCard>
      ) : (
        competitions.map((competition) => (
          <CompetitionCard
            key={competition.slug}
            competition={competition}
            action={<JoinButton slug={competition.slug} />}
          />
        ))
      )}
    </View>
  )
}

/** Every way to start a competition, plus joining with a code. */
export function StartChoices() {
  const items = [
    ...CREATE_CHOICES.map((choice) => ({
      key: choice.format,
      icon: 'Trophy' as const,
      title: choice.title,
      description: choice.description as string,
      go: () =>
        router.push({
          pathname: '/competitions/new',
          params: { format: choice.format },
        }),
    })),
    {
      key: 'join',
      icon: 'UserPlus' as const,
      title: 'Join with a code',
      description: 'Got an invite code from a friend? Enter it here.',
      go: () => router.push('/join'),
    },
  ]
  return (
    <View className="gap-3">
      {items.map((item) => (
        <Card key={item.key} className="p-0">
          <PressableFeedback
            className="flex-row items-center gap-4 px-4 py-4"
            onPress={item.go}
            accessibilityRole="link"
          >
            <IconBadge name={item.icon} size={48} />
            <View className="flex-1">
              <Text className="font-semibold text-base text-foreground">
                {item.title}
              </Text>
              <Text className="font-normal text-xs text-muted">
                {item.description}
              </Text>
            </View>
            <Chevron />
          </PressableFeedback>
        </Card>
      ))}
    </View>
  )
}

function Chevron() {
  return <Icon name="ChevronRight" size={16} color={useThemeColor('muted')} />
}

/** "How a league works": the format's rules, folded, as an accordion. */
export function FormatExplainer({
  format,
}: {
  format: CompetitionSummary['format']
}) {
  return (
    <Accordion selectionMode="single" variant="surface">
      <Accordion.Item value="how">
        <Accordion.Trigger>
          <Text className="font-medium text-sm text-foreground">
            How a {FORMAT_LABEL[format].toLowerCase()} works
          </Text>
          <Accordion.Indicator />
        </Accordion.Trigger>
        <Accordion.Content>
          <View className="gap-1">
            {FORMAT_INFO[format].points.map((point) => (
              <Text key={point} className="font-normal text-sm text-muted">
                • {point}
              </Text>
            ))}
          </View>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  )
}
