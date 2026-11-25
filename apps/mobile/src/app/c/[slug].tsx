import type { CompetitionPage } from '@misri/api-client'
import {
  FORMAT_LABEL,
  LEAVE_HELP,
  STATUS_LABEL,
  scoringSummary,
} from '@misri/core/formats'
import { groupName } from '@misri/core/groups'
import { timeControlLabel } from '@misri/core/time-control'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Button, Card, Spinner, Tabs } from 'heroui-native'
import { type ReactNode, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { FormError } from '@/auth-shell'
import {
  EmptyCard,
  FormatExplainer,
  IconBadge,
  JoinButton,
  Kicker,
} from '@/competitions'
import { Loading, Problem, Screen } from '@/components'
import { formatDate } from '@/lib/format'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'
import {
  Confirm,
  displayName,
  FixtureCard,
  MatchReport,
  type MatchView,
  PlayerAvatar,
  PlayerChip,
  type PlayerView,
} from '@/match'
import { DecideMatch, OwnerPanel, RemovePlayer } from '@/organiser'

type Data = CompetitionPage
type StandingRow = NonNullable<Data['standings']>[number]

/** A competition, as on the website: header, then table, fixtures and players. */
export default function Competition() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { api, me } = useSession()
  const { data, error, loading, reload } = useLoad(
    () => (api ? api.competition(slug) : Promise.resolve(null)),
    `${Boolean(api)}:${slug}`,
  )

  if (error && !data) {
    return (
      <Screen>
        <Problem message={error} onRetry={reload} />
      </Screen>
    )
  }
  if (!data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }

  const { competition, members, playerCount, canSeeDetails, isMember, join } =
    data
  const viewerId = me?.id ?? null
  const challenge = competition.format === 'challenge'
  const groups = competition.format === 'groups'
  const champion = members.find((m) => m.id === competition.championId)
  const days = `${competition.matchdayDays} day${competition.matchdayDays === 1 ? '' : 's'}`

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView
        contentContainerClassName="gap-5 p-4 pb-10"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} />
        }
      >
        <View className="items-center gap-1">
          <Text className="font-semibold text-center text-xs uppercase tracking-widest text-muted">
            {FORMAT_LABEL[competition.format]} ·{' '}
            {competition.resultSource === 'manual'
              ? 'Results reported by players'
              : timeControlLabel(competition.timeControl)}{' '}
            · {STATUS_LABEL[competition.status]}
          </Text>
          <Text className="font-display text-center text-4xl uppercase text-foreground">
            {competition.name}
          </Text>
          {competition.status === 'open' && competition.startsAt && (
            <Text className="font-normal text-sm text-muted">
              Starts {formatDate(competition.startsAt)}
            </Text>
          )}
          <Text className="font-normal text-center text-xs text-muted">
            {competition.maxPlayers
              ? `${playerCount} of ${competition.maxPlayers} players`
              : `${playerCount} player${playerCount === 1 ? '' : 's'}`}
            {competition.legs === 2 && ' · home & away'}
            {challenge && ` · best of ${competition.bestOf}`}
            {groups &&
              ` · ${competition.groupCount} groups, top ${competition.advancing} through`}
            {` · ${days} ${challenge ? 'to play' : 'per round'}`}
          </Text>
          <Text className="font-normal text-center text-xs text-muted">
            {scoringSummary(
              competition.format,
              competition.unplayedRule,
              competition.points,
            )}
          </Text>
        </View>

        {competition.status === 'finished' && champion && (
          <Card>
            <Card.Body className="items-center gap-3 py-3">
              <View>
                <PlayerAvatar player={champion} size="lg" />
                <View className="absolute -right-1 -bottom-1">
                  <IconBadge name="Trophy" size={30} />
                </View>
              </View>
              <Kicker>Champion</Kicker>
              <Text className="font-display text-2xl uppercase text-foreground">
                {viewerId === champion.id
                  ? 'You won it!'
                  : displayName(champion)}
              </Text>
            </Card.Body>
          </Card>
        )}

        {data.challengeScore && (
          <ChallengeScore
            slug={competition.slug}
            matches={data.matches}
            score={data.challengeScore}
            finished={competition.status === 'finished'}
            viewerId={viewerId}
          />
        )}

        {data.canManage && <OwnerPanel data={data} reload={reload} />}

        {!isMember && <FormatExplainer format={competition.format} />}

        {!isMember &&
          (!join.ok ? (
            <EmptyCard>{join.reason}</EmptyCard>
          ) : data.requested ? (
            <EmptyCard>Request sent. Waiting for the organiser.</EmptyCard>
          ) : competition.visibility === 'public' ? (
            <JoinButton
              slug={competition.slug}
              size="lg"
              label={competition.requireApproval ? 'Ask to join' : 'Join'}
            />
          ) : (
            <EmptyCard>Invite only. Ask the organiser for the code.</EmptyCard>
          ))}

        {canSeeDetails ? (
          <Sections data={data} viewerId={viewerId} reload={reload} />
        ) : (
          <EmptyCard>
            Invite only. Players, fixtures and the table are for people in it.
          </EmptyCard>
        )}

        {isMember && !data.isOrganiser && competition.status !== 'finished' && (
          <LeaveButton data={data} onLeft={reload} />
        )}
      </ScrollView>
    </Screen>
  )
}

function Sections({
  data,
  viewerId,
  reload,
}: {
  data: Data
  viewerId: string | null
  reload: () => void
}) {
  const { competition } = data
  const league = competition.format === 'league'
  const challenge = competition.format === 'challenge'
  const groups = competition.format === 'groups'
  const [tab, setTab] = useState(
    competition.status === 'open'
      ? 'players'
      : challenge
        ? 'fixtures'
        : 'table',
  )
  const tabs = [
    ...(!challenge
      ? [
          {
            value: 'table',
            label: league ? 'Table' : groups ? 'Groups' : 'Bracket',
          },
        ]
      : []),
    ...(groups ? [{ value: 'bracket', label: 'Bracket' }] : []),
    { value: 'fixtures', label: 'Fixtures' },
    { value: 'players', label: 'Players' },
  ]
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <Tabs.List className="w-full">
        <Tabs.Indicator />
        {tabs.map((t) => (
          <Tabs.Trigger key={t.value} value={t.value} className="flex-1">
            <Tabs.Label>{t.label}</Tabs.Label>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="table" className="pt-3">
        {groups ? (
          <GroupTables data={data} />
        ) : league ? (
          (data.standings ?? []).length === 0 || data.matches.length === 0 ? (
            <EmptyCard>The table appears once the league starts.</EmptyCard>
          ) : (
            <StandingsTable rows={data.standings ?? []} />
          )
        ) : data.matches.length === 0 ? (
          <EmptyCard>The bracket appears once the tournament starts.</EmptyCard>
        ) : (
          <Bracket matches={data.matches} />
        )}
      </Tabs.Content>
      <Tabs.Content value="bracket" className="pt-3">
        {data.matches.some((m) => m.groupNo === null) ? (
          <Bracket matches={knockoutPart(data.matches)} />
        ) : (
          <EmptyCard>
            The bracket is drawn once every group game is settled.
          </EmptyCard>
        )}
      </Tabs.Content>
      <Tabs.Content value="fixtures" className="pt-3">
        <Fixtures data={data} viewerId={viewerId} reload={reload} />
      </Tabs.Content>
      <Tabs.Content value="players" className="gap-3 pt-3">
        {data.members.map((member) => (
          <Card
            key={member.id}
            className="flex-row items-center justify-between px-3 py-2.5"
          >
            <PlayerChip player={member} size="md" />
            {member.id === competition.ownerId ? (
              <Kicker>Organiser</Kicker>
            ) : (
              data.canManage &&
              competition.status !== 'finished' && (
                <RemovePlayer data={data} player={member} onDone={reload} />
              )
            )}
          </Card>
        ))}
      </Tabs.Content>
    </Tabs>
  )
}

const COLUMNS = ['W', 'D', 'L', 'F'] as const

function StandingsTable({
  rows,
  caption,
  through = 0,
}: {
  rows: StandingRow[]
  caption?: string
  through?: number
}) {
  return (
    <Card className="p-0">
      {caption && (
        <View className="px-3 pt-3">
          <Kicker>{caption}</Kicker>
        </View>
      )}
      <View className="flex-row border-b border-border px-3 py-2">
        <Head className="w-7 text-left">#</Head>
        <Head className="flex-1 text-left">Player</Head>
        {COLUMNS.map((c) => (
          <Head key={c} className="w-8">
            {c}
          </Head>
        ))}
        <Head className="w-10 text-right">Pts</Head>
      </View>
      {rows.map((row, i) => (
        <View
          key={row.player.id}
          className={`flex-row items-center px-3 py-2 ${i < rows.length - 1 ? 'border-b border-border/60' : ''} ${i < through ? 'bg-accent/10' : ''}`}
        >
          <Text
            className={`w-7 text-sm ${i < through ? 'font-bold text-accent' : 'font-normal text-muted'}`}
          >
            {i + 1}
          </Text>
          <View className="flex-1 pr-2">
            <PlayerChip player={row.player} />
          </View>
          {[row.wins, row.draws, row.losses, row.forfeits].map((n, k) => (
            <Text
              key={COLUMNS[k]}
              className="font-normal w-8 text-center text-sm text-foreground"
            >
              {n}
            </Text>
          ))}
          <Text className="font-bold w-10 text-right text-sm text-foreground">
            {row.points}
          </Text>
        </View>
      ))}
    </Card>
  )
}

function Head({
  children,
  className,
}: {
  children: ReactNode
  className: string
}) {
  return (
    <Text
      className={`font-semibold text-center text-[11px] uppercase tracking-widest text-muted ${className}`}
    >
      {children}
    </Text>
  )
}

function GroupTables({ data }: { data: Data }) {
  const tables = data.groupTables ?? []
  if (tables.length === 0) {
    return (
      <EmptyCard>The groups are drawn when the organiser starts it.</EmptyCard>
    )
  }
  return (
    <View className="gap-3">
      <Text className="font-normal text-xs text-muted">
        Highlighted: going through to the knockout (top{' '}
        {data.competition.advancing} of each group).
      </Text>
      {tables.map((table) => (
        <StandingsTable
          key={table.name}
          caption={`Group ${table.name}`}
          rows={table.rows}
          through={data.competition.advancing}
        />
      ))}
    </View>
  )
}

function knockoutPart(matches: MatchView[]) {
  const knockout = matches.filter((m) => m.groupNo === null)
  const offset = Math.min(...knockout.map((m) => m.round)) - 1
  return knockout.map((m) => ({ ...m, round: m.round - offset }))
}

function byRound(matches: MatchView[]) {
  const rounds = new Map<number, MatchView[]>()
  for (const m of matches)
    rounds.set(m.round, [...(rounds.get(m.round) ?? []), m])
  return [...rounds.entries()]
}

/** Ties in a round: home & away legs and a decider share one position. */
// shortcut: a two-leg tie isn't marked with a winner here; the website's bracket has the full tie
const tieCount = (matches: MatchView[]) =>
  new Set(matches.map((m) => m.position)).size

function knockoutRoundName(count: number, round: number) {
  if (count === 1) return 'Final'
  if (count === 2) return 'Semi-finals'
  if (count === 4) return 'Quarter-finals'
  return `Round ${round}`
}

/** The knockout round by round, each tie on one line, winners in bold. */
function Bracket({ matches }: { matches: MatchView[] }) {
  return (
    <View className="gap-4">
      {byRound(matches).map(([round, ties]) => (
        <View key={round} className="gap-2">
          <Kicker>{knockoutRoundName(tieCount(ties), round)}</Kicker>
          <Card className="p-0">
            {ties
              .filter(
                (m, i) =>
                  ties.findIndex((t) => t.position === m.position) === i,
              )
              .map((m, i, rows) => (
                <View
                  key={m.id}
                  className={`gap-1 px-3 py-2 ${i < rows.length - 1 ? 'border-b border-border/60' : ''}`}
                >
                  {m.bye ? (
                    <Text className="font-medium text-sm text-foreground">
                      {displayName(m.bye)}{' '}
                      <Text className="text-muted">· bye</Text>
                    </Text>
                  ) : (
                    [m.home, m.away].map((p, k) => (
                      <Text
                        key={p?.id ?? k}
                        className={`text-sm ${
                          p &&
                          // a two-leg tie's winner is the aggregate, not one leg's
                          ties.filter((t) => t.position === m.position)
                            .length === 1 &&
                          (
                            m.winnerId === p.id ||
                              (m.homeWon !== null && (k === 0) === m.homeWon)
                          )
                            ? 'font-bold text-foreground'
                            : 'font-normal text-muted'
                        }`}
                      >
                        {p ? displayName(p) : 'To be decided'}
                      </Text>
                    ))
                  )}
                </View>
              ))}
          </Card>
        </View>
      ))}
    </View>
  )
}

function roundLabel(data: Data, round: number, count: number) {
  const { format } = data.competition
  if (format === 'challenge') return `Game ${round}`
  if (format === 'groups') {
    const games = data.matches.filter((m) => m.round === round)
    if (games.some((m) => m.groupNo !== null))
      return `Group stage · round ${round}`
    return knockoutRoundName(count, round)
  }
  if (format === 'knockout') return knockoutRoundName(count, round)
  return round > data.scheduledRounds ? 'Late entry' : `Round ${round}`
}

/** A league's late-entry rounds on top, so new games aren't missed below. */
function lateFirst(data: Data) {
  const rounds = byRound(data.matches)
  if (data.competition.format !== 'league') return rounds
  const late = rounds.filter(([r]) => r > data.scheduledRounds)
  return [
    ...late.reverse(),
    ...rounds.filter(([r]) => r <= data.scheduledRounds),
  ]
}

function Fixtures({
  data,
  viewerId,
  reload,
}: {
  data: Data
  viewerId: string | null
  reload: () => void
}) {
  const now = Date.now()
  if (data.matches.length === 0) {
    return <EmptyCard>Fixtures appear once the organiser starts it.</EmptyCard>
  }
  const { competition } = data
  return (
    <View className="gap-5">
      {lateFirst(data).map(([round, matches]) => (
        <View key={round} className="gap-3">
          <Kicker>{roundLabel(data, round, tieCount(matches))}</Kicker>
          {matches.map((match) => (
            <FixtureCard key={match.id} match={match} now={now}>
              {competition.format === 'groups' && match.groupNo !== null && (
                <Text className="font-medium mt-1.5 text-center text-xs text-muted">
                  Group {groupName(match.groupNo)}
                </Text>
              )}
              {competition.format === 'knockout' &&
                competition.legs === 2 &&
                !match.bye && (
                  <Text className="font-medium mt-1.5 text-center text-xs text-muted">
                    {match.leg >= 3 ? 'Decider' : `Leg ${match.leg} of 2`}
                  </Text>
                )}
              {data.canManage &&
                competition.status === 'running' &&
                match.home !== null &&
                match.away !== null && (
                  <DecideMatch data={data} match={match} onDone={reload} />
                )}
              <MatchReport
                slug={competition.slug}
                match={match}
                viewerId={viewerId}
                primary={competition.resultSource === 'manual'}
                onDone={reload}
              />
              {concedable(data, match, viewerId) && (
                <ConcedeButton
                  slug={competition.slug}
                  match={match}
                  viewerId={viewerId as string}
                  onDone={reload}
                />
              )}
            </FixtureCard>
          ))}
        </View>
      ))}
    </View>
  )
}

function concedable(data: Data, match: MatchView, viewerId: string | null) {
  return (
    viewerId !== null &&
    data.competition.status === 'running' &&
    match.home !== null &&
    match.away !== null &&
    (match.home.id === viewerId || match.away.id === viewerId) &&
    match.result === null &&
    match.winnerId === null &&
    match.status !== 'void'
  )
}

function ConcedeButton({
  slug,
  match,
  viewerId,
  onDone,
}: {
  slug: string
  match: MatchView
  viewerId: string
  onDone: () => void
}) {
  const { api } = useSession()
  const opponent = displayName(
    (match.home?.id === viewerId ? match.away : match.home) as PlayerView,
  )
  return (
    <Confirm
      trigger={(open) => (
        <Button variant="ghost" size="sm" onPress={open}>
          Can't play? Give walkover
        </Button>
      )}
      title={`Give ${opponent} the walkover?`}
      description={`${opponent} gets the win for this match. You can't take it back; only the organiser can reopen it.`}
      confirmLabel="Give walkover"
      danger
      onConfirm={async () => {
        await api?.act('concedeMatch', { slug, matchId: match.id })
        onDone()
      }}
    />
  )
}

function LeaveButton({ data, onLeft }: { data: Data; onLeft: () => void }) {
  const { api } = useSession()
  const { competition } = data
  const started = competition.status !== 'open'
  const consequence = !started
    ? "It hasn't started, so you can join again later."
    : competition.format === 'knockout'
      ? "Your opponent goes through, and you can't rejoin."
      : `${LEAVE_HELP[competition.leaveRule]} You can't rejoin.`
  return (
    <Confirm
      trigger={(open) => (
        <Button variant="danger-soft" onPress={open}>
          Leave competition
        </Button>
      )}
      title="Leave this competition?"
      description={consequence}
      confirmLabel="Leave"
      danger
      onConfirm={async () => {
        await api?.act('leaveCompetition', { slug: competition.slug })
        onLeft()
      }}
    />
  )
}

function ChallengeScore({
  slug,
  matches,
  score,
  finished,
  viewerId,
}: {
  slug: string
  matches: MatchView[]
  score: { a: number; b: number }
  finished: boolean
  viewerId: string | null
}) {
  const { api } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [first] = matches
  if (!first?.home || !first.away) return null
  const [a, b] = [first.home, first.away]
  const show = (n: number) => (n % 1 ? `${Math.floor(n) || ''}½` : String(n))
  return (
    <Card>
      <Card.Body className="gap-3">
        <View className="flex-row items-center gap-3">
          <PlayerChip player={a} size="md" />
          <Text className="font-display text-3xl text-foreground">
            {show(score.a)}
            <Text className="text-muted"> : </Text>
            {show(score.b)}
          </Text>
          <PlayerChip player={b} size="md" />
        </View>
        {finished && score.a === score.b && (
          <Text className="font-normal text-center text-sm text-muted">
            Drawn match: neither could be caught.
          </Text>
        )}
        {finished && (viewerId === a.id || viewerId === b.id) && (
          <>
            <FormError message={error} />
            <Button
              variant="secondary"
              isDisabled={busy}
              onPress={async () => {
                if (!api) return
                setBusy(true)
                setError(null)
                try {
                  const created = await api.act('rematch', { slug })
                  router.replace(`/c/${created.slug}`)
                } catch (cause) {
                  setError((cause as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? (
                <Spinner size="sm" />
              ) : (
                <Button.Label>Rematch</Button.Label>
              )}
            </Button>
          </>
        )}
      </Card.Body>
    </Card>
  )
}
