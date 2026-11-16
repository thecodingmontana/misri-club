import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Spinner } from '#/components/auth'
import { BracketView } from '#/components/bracket-view'
import { ChampionBanner } from '#/components/champion-banner'
import {
  ConcedeButton,
  DeleteCompetition,
  EarlyRoundsChoice,
  HandOver,
  JoinRequests,
  LeaveButton,
  LeaveRuleChoice,
  MaxPlayersField,
  NewInviteCode,
  RemovePlayer,
  RenameCompetition,
} from '#/components/competition-actions'
import {
  Choice,
  FORMAT_LABEL,
  FormatExplainer,
  JoinButton,
  STATUS_LABEL,
} from '#/components/competitions'
import { CopyIcon } from '#/components/copy-icon'
import { displayName, FixtureCard } from '#/components/match-card'
import { DecideMatch } from '#/components/match-decision'
import { PlayerChip } from '#/components/player-chip'
import { ScoringRules, scoringSummary } from '#/components/scoring-rules'
import { Seeding } from '#/components/seeding'
import {
  StartDateField,
  startDayOf,
  TieBreakOrder,
} from '#/components/start-and-ties'
import { TimeControlChoice } from '#/components/time-control'
import { Button } from '#/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { formatDate } from '#/lib/format'
import { groupName } from '#/lib/groups'
import { seo } from '#/lib/seo'
import { timeControlLabel } from '#/lib/time-control'
import { toast } from '#/lib/toast'
import { useAdmin } from '#/lib/use-admin'
import { useCopy } from '#/lib/use-copy'
import { cn } from '#/lib/utils'
import type {
  MatchView,
  PlayerView,
  StandingRow,
} from '#/server/competition-view.server'
import {
  getCompetitionFn,
  openEarlyRoundFn,
  startCompetitionFn,
  updateCompetitionSettingsFn,
} from '#/server/competitions.functions'

/** A competition: public to read; the organiser manages it from here. */
export const Route = createFileRoute('/c/$slug')({
  loader: async ({ params }) => {
    const data = await getCompetitionFn({ data: { slug: params.slug } })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData, params }) =>
    seo({
      title: loaderData?.competition.name ?? 'Competition',
      description: loaderData
        ? `${FORMAT_LABEL[loaderData.competition.format]} on Misri with ${loaderData.playerCount} players.`
        : 'A chess competition on Misri.',
      path: `/c/${params.slug}`,
      noindex: loaderData?.competition.visibility !== 'public',
    }),
  component: CompetitionPage,
})

type Data = ReturnType<typeof Route.useLoaderData>

function CompetitionPage() {
  const data = Route.useLoaderData()
  const {
    competition,
    members,
    playerCount,
    canManage,
    canSeeDetails,
    isMember,
    join,
  } = data
  const { user } = useAdmin()
  const league = competition.format === 'league'
  const challenge = competition.format === 'challenge'
  const groups = competition.format === 'groups'
  const champion = members.find(
    (m: PlayerView) => m.id === competition.championId,
  )

  return (
    <div className="space-y-5 pt-2">
      <header className="text-center">
        <p className="kicker">
          {FORMAT_LABEL[competition.format]} ·{' '}
          {timeControlLabel(competition.timeControl)} ·{' '}
          {STATUS_LABEL[competition.status]}
        </p>
        <h1 className="display mt-1 text-3xl">{competition.name}</h1>
        {competition.status === 'open' && competition.startsAt && (
          <p className="mt-1 text-sm text-muted-foreground">
            Starts {formatDate(competition.startsAt)}
          </p>
        )}
        <p className="numeric mt-1 text-xs text-muted-foreground">
          {competition.maxPlayers
            ? `${playerCount} of ${competition.maxPlayers} players`
            : `${playerCount} player${playerCount === 1 ? '' : 's'}`}
          {competition.legs === 2 && ' · home & away'}
          {challenge && ` · best of ${competition.bestOf}`}
          {groups &&
            ` · ${competition.groupCount} groups, top ${competition.advancing} through`}{' '}
          · {competition.matchdayDays} day
          {competition.matchdayDays === 1 ? '' : 's'}{' '}
          {challenge ? 'to play' : 'per round'}
        </p>
        <p className="numeric mt-0.5 text-xs text-muted-foreground">
          {scoringSummary(
            competition.format,
            competition.unplayedRule,
            competition.points,
          )}
        </p>
      </header>

      {competition.status === 'finished' && champion && (
        <ChampionBanner
          slug={competition.slug}
          champion={champion}
          isYou={user?.id === champion.id}
        />
      )}

      {challenge && data.matches.length > 0 && (
        <ChallengeScore
          matches={data.matches}
          finished={competition.status === 'finished'}
        />
      )}

      {canManage && <OwnerPanel data={data} />}

      {!isMember && <FormatExplainer format={competition.format} />}

      {!isMember &&
        (join.ok ? (
          user ? (
            data.requested ? (
              <p className="rounded-2xl bg-card px-4 py-3 text-center text-sm text-muted-foreground shadow-card">
                Request sent. Waiting for the organiser.
              </p>
            ) : competition.visibility === 'public' ? (
              <JoinButton
                slug={competition.slug}
                label={competition.requireApproval ? 'Ask to join' : 'Join'}
                size="lg"
              />
            ) : (
              <p className="rounded-2xl bg-card px-4 py-3 text-center text-sm text-muted-foreground shadow-card">
                Invite only. Ask the organiser for the code.
              </p>
            )
          ) : (
            <Button asChild size="lg" className="w-full rounded-xl">
              <Link
                to="/auth/signin"
                search={{ redirect: `/c/${competition.slug}` }}
              >
                Sign in to join
              </Link>
            </Button>
          )
        ) : (
          <p className="rounded-2xl bg-card px-4 py-3 text-center text-sm text-muted-foreground shadow-card">
            {join.reason}
          </p>
        ))}

      {canSeeDetails ? (
        <Tabs
          defaultValue={
            competition.status === 'open'
              ? 'players'
              : challenge
                ? 'fixtures'
                : 'table'
          }
        >
          <TabsList className="w-full">
            {!challenge && (
              <TabsTrigger value="table">
                {league ? 'Table' : groups ? 'Groups' : 'Bracket'}
              </TabsTrigger>
            )}
            {groups && <TabsTrigger value="bracket">Bracket</TabsTrigger>}
            <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
            <TabsTrigger value="players">Players</TabsTrigger>
          </TabsList>
          {groups && (
            <TabsContent value="bracket" className="pt-2">
              {data.matches.some((m: MatchView) => m.groupNo === null) ? (
                <BracketView
                  matches={knockoutPart(data.matches)}
                  viewerId={user?.id ?? null}
                  champion={champion ?? null}
                />
              ) : (
                <Empty>
                  The bracket is drawn once every group game is settled.
                </Empty>
              )}
            </TabsContent>
          )}
          <TabsContent value="table" className="pt-2">
            {groups ? (
              <GroupTables data={data} />
            ) : league ? (
              <Standings data={data} />
            ) : data.matches.length === 0 ? (
              <Empty>The bracket appears once the tournament starts.</Empty>
            ) : (
              <BracketView
                matches={data.matches}
                viewerId={user?.id ?? null}
                champion={champion ?? null}
              />
            )}
          </TabsContent>
          <TabsContent value="fixtures" className="pt-2">
            <Fixtures data={data} />
          </TabsContent>
          <TabsContent value="players" className="space-y-2 pt-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-2 rounded-2xl bg-card px-3 py-2.5 shadow-card"
              >
                <PlayerChip
                  username={displayName(member)}
                  image={member.image}
                />
                {member.id === competition.ownerId ? (
                  <span className="kicker">Organiser</span>
                ) : (
                  canManage &&
                  competition.status !== 'finished' && (
                    <RemovePlayer
                      slug={competition.slug}
                      userId={member.id}
                      name={displayName(member)}
                      started={competition.status !== 'open'}
                      format={competition.format}
                      leaveRule={competition.leaveRule}
                    />
                  )
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      ) : (
        <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
          Invite only. Players, fixtures and the table are for people in it.
        </p>
      )}

      {isMember && !data.isOrganiser && competition.status !== 'finished' && (
        <LeaveButton
          slug={competition.slug}
          started={competition.status !== 'open'}
          format={competition.format}
          leaveRule={competition.leaveRule}
        />
      )}
    </div>
  )
}

function OwnerPanel({ data }: { data: Data }) {
  const { competition, members } = data
  const router = useRouter()
  const start = useServerFn(startCompetitionFn)
  const update = useServerFn(updateCompetitionSettingsFn)
  const openEarly = useServerFn(openEarlyRoundFn)
  const [busy, setBusy] = useState(false)
  const league = competition.format === 'league'
  // two players, invite only, starts when the opponent joins: nothing to set there
  const challenge = competition.format === 'challenge'

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true)
    try {
      await action()
      await router.invalidate()
      if (done) toast.success(done)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = (
    patch: Partial<Omit<Parameters<typeof update>[0]['data'], 'slug'>>,
  ) =>
    run(() =>
      update({
        data: {
          slug: competition.slug,
          visibility: competition.visibility,
          allowLateEntry: competition.allowLateEntry,
          unplayedRule: competition.unplayedRule,
          points: competition.points,
          leaveRule: competition.leaveRule,
          earlyRounds: competition.earlyRounds,
          timeControl: competition.timeControl,
          tieBreaks: competition.tieBreaks,
          startsOn: startDayOf(competition.startsAt),
          maxPlayers: competition.maxPlayers,
          requireApproval: competition.requireApproval,
          ...patch,
        },
      }),
    )

  const { copied, copy } = useCopy()
  const copyLink = () =>
    copy(
      `${window.location.origin}/join/${competition.inviteCode}`,
      "Couldn't copy. Share the code instead.",
    )

  const canTakePlayers =
    competition.status === 'open' ||
    (league && competition.status === 'running' && competition.allowLateEntry)

  return (
    <section
      aria-label="Organiser"
      className="space-y-4 rounded-2xl bg-card p-4 shadow-card"
    >
      {canTakePlayers && competition.inviteCode && (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="kicker">Invite code</p>
            <p className="display numeric text-2xl tracking-[0.2em]">
              {competition.inviteCode}
            </p>
          </div>
          <Button
            variant="secondary"
            className="rounded-full"
            onClick={copyLink}
          >
            <CopyIcon copied={copied} />
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      )}
      {canTakePlayers && competition.inviteCode && (
        <div className="-mt-2">
          <NewInviteCode slug={competition.slug} />
        </div>
      )}

      {competition.status !== 'finished' && (
        <RenameCompetition
          key={competition.name}
          slug={competition.slug}
          name={competition.name}
        />
      )}

      {!challenge && competition.status !== 'finished' && (
        <MaxPlayersField
          key={competition.maxPlayers ?? 'none'}
          value={competition.maxPlayers}
          onSave={(maxPlayers) => save({ maxPlayers })}
        />
      )}

      {!challenge && (
        <Choice
          label="Who can join"
          value={competition.visibility}
          onChange={(visibility) => save({ visibility })}
          options={[
            { value: 'private', label: 'Invite only' },
            { value: 'public', label: 'Anyone' },
          ]}
        />
      )}

      {!challenge && competition.status !== 'finished' && (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={competition.requireApproval}
            disabled={busy}
            onChange={(event) =>
              save({ requireApproval: event.target.checked })
            }
          />
          <span>
            <span className="block font-medium">Approve each player</span>
            <span className="block text-xs text-muted-foreground">
              Joining sends you a request instead of letting them straight in.
            </span>
          </span>
        </label>
      )}

      <JoinRequests
        slug={competition.slug}
        requests={data.requests.map((r: PlayerView) => ({
          id: r.id,
          name: displayName(r),
          image: r.image,
        }))}
      />

      {league && competition.status !== 'finished' && (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={competition.allowLateEntry}
            disabled={busy}
            onChange={(event) => save({ allowLateEntry: event.target.checked })}
          />
          <span>
            <span className="block font-medium">Allow late entry</span>
            <span className="block text-xs text-muted-foreground">
              Players can still join after it starts.
            </span>
          </span>
        </label>
      )}

      {!challenge && competition.status === 'open' && (
        <StartDateField
          key={competition.startsAt ?? 'none'}
          value={startDayOf(competition.startsAt)}
          disabled={busy}
          onChange={(startsOn) => save({ startsOn })}
        />
      )}

      {league && competition.status !== 'finished' && (
        <TieBreakOrder
          value={competition.tieBreaks}
          disabled={busy}
          onChange={(tieBreaks) => save({ tieBreaks })}
        />
      )}

      {competition.status === 'open' && (
        <TimeControlChoice
          value={competition.timeControl}
          onChange={(timeControl) => save({ timeControl })}
        />
      )}

      {competition.status !== 'finished' && (
        <ScoringRules
          format={competition.format}
          unplayedRule={competition.unplayedRule}
          points={competition.points}
          disabled={busy}
          onChange={(scoring) => save(scoring)}
        />
      )}

      {league && competition.status !== 'finished' && (
        <EarlyRoundsChoice
          value={competition.earlyRounds}
          onChange={(earlyRounds) => save({ earlyRounds })}
        />
      )}

      {data.earlyRound !== null && (
        <div className="flex items-center gap-3 rounded-xl bg-primary/10 p-3">
          <p className="min-w-0 flex-1 text-sm">
            Everyone has played. Open round {data.earlyRound} now? Its deadline
            stays the same.
          </p>
          <Button
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={() =>
              run(
                () => openEarly({ data: { slug: competition.slug } }),
                `Round ${data.earlyRound} is open. Players were told.`,
              )
            }
          >
            Open round {data.earlyRound}
          </Button>
        </div>
      )}

      {league && competition.status !== 'finished' && (
        <LeaveRuleChoice
          value={competition.leaveRule}
          onChange={(leaveRule) => save({ leaveRule })}
        />
      )}

      {data.awaitingDecision.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Needs your call ({data.awaitingDecision.length})
          </p>
          <p className="text-xs text-muted-foreground">
            These ran out of time without a result. Award a walkover, call it
            off or give more time.
          </p>
          {data.matches
            .filter((m: MatchView) => data.awaitingDecision.includes(m.id))
            .map((match: MatchView) => (
              <FixtureCard key={match.id} match={match} now={Date.now()}>
                <DecideMatch
                  slug={competition.slug}
                  match={match}
                  format={competition.format}
                  twoLegs={competition.legs === 2}
                />
              </FixtureCard>
            ))}
        </div>
      )}

      {(competition.format === 'knockout' || competition.format === 'groups') &&
        competition.status === 'open' && (
          <Seeding slug={competition.slug} members={members} />
        )}

      {competition.status === 'open' && (
        <Button
          size="lg"
          className="w-full rounded-xl"
          disabled={busy || members.length < 2}
          onClick={() =>
            run(
              () => start({ data: { slug: competition.slug } }),
              'Started. Fixtures are out.',
            )
          }
        >
          {busy && <Spinner />}
          {members.length < 2 ? 'Start (needs 2 players)' : 'Start'}
        </Button>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <HandOver
          slug={competition.slug}
          members={members
            .filter((m: PlayerView) => m.id !== competition.ownerId)
            .map((m: PlayerView) => ({ id: m.id, name: displayName(m) }))}
        />
        <DeleteCompetition slug={competition.slug} name={competition.name} />
      </div>
    </section>
  )
}

function StandingsTable({
  rows,
  caption,
  through = 0,
}: {
  rows: Array<StandingRow>
  caption?: string
  /** groups: how many go through (their rows are marked) */
  through?: number
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <table className="numeric w-full text-sm">
        {caption && (
          <caption className="kicker px-3 pt-3 text-left">{caption}</caption>
        )}
        <thead className="kicker">
          <tr className="border-b border-border">
            <th className="w-8 py-2 pl-3 text-left font-semibold">#</th>
            <th className="py-2 text-left font-semibold">Player</th>
            <th className="py-2 text-center font-semibold" data-tip="Wins">
              W
            </th>
            <th className="py-2 text-center font-semibold" data-tip="Draws">
              D
            </th>
            <th className="py-2 text-center font-semibold" data-tip="Losses">
              L
            </th>
            <th
              className="py-2 pr-3 text-right font-semibold"
              data-tip="Points"
            >
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.player.id}
              className={cn(
                'border-b border-border/60 last:border-0',
                index < through && 'bg-primary/6',
              )}
            >
              <td
                className={cn(
                  'py-2 pl-3 text-muted-foreground',
                  index < through && 'font-bold text-primary',
                )}
              >
                {index + 1}
              </td>
              <td className="max-w-0 py-2">
                <PlayerChip
                  username={displayName(row.player)}
                  image={row.player.image}
                  size="sm"
                />
              </td>
              <td className="py-2 text-center">{row.wins}</td>
              <td className="py-2 text-center">{row.draws}</td>
              <td className="py-2 text-center">{row.losses}</td>
              <td className="py-2 pr-3 text-right font-bold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Standings({ data }: { data: Data }) {
  const rows: Array<StandingRow> = data.standings ?? []
  if (rows.length === 0 || data.matches.length === 0) {
    return <Empty>The table appears once the league starts.</Empty>
  }
  return <StandingsTable rows={rows} />
}

/** Groups then knockout: a table per group, the qualifying places marked. */
function GroupTables({ data }: { data: Data }) {
  const tables: Array<{ name: string; rows: Array<StandingRow> }> =
    data.groupTables ?? []
  if (tables.length === 0) {
    return <Empty>The groups are drawn when the organiser starts it.</Empty>
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Highlighted: going through to the knockout (top{' '}
        {data.competition.advancing} of each group).
      </p>
      {tables.map((table) => (
        <StandingsTable
          key={table.name}
          caption={`Group ${table.name}`}
          rows={table.rows}
          through={data.competition.advancing}
        />
      ))}
    </div>
  )
}

/** A groups competition's bracket: its knockout games, rounds counted from 1. */
function knockoutPart(matches: MatchView[]) {
  const knockout = matches.filter((m) => m.groupNo === null)
  const offset = Math.min(...knockout.map((m) => m.round)) - 1
  return knockout.map((m) => ({ ...m, round: m.round - offset }))
}

function byRound(matches: Array<MatchView>) {
  const rounds = new Map<number, Array<MatchView>>()
  for (const match of matches) {
    rounds.set(match.round, [...(rounds.get(match.round) ?? []), match])
  }
  return [...rounds.entries()]
}

function knockoutRoundName(matchCount: number, round: number) {
  if (matchCount === 1) return 'Final'
  if (matchCount === 2) return 'Semi-finals'
  if (matchCount === 4) return 'Quarter-finals'
  return `Round ${round}`
}

function roundLabel(data: Data, round: number, matchCount: number) {
  if (data.competition.format === 'challenge') return `Game ${round}`
  if (data.competition.format === 'groups') {
    const games = data.matches.filter((m: MatchView) => m.round === round)
    if (games.some((m: MatchView) => m.groupNo !== null)) {
      return `Group stage · round ${round}`
    }
    return knockoutRoundName(matchCount, round)
  }
  if (data.competition.format === 'knockout') {
    return knockoutRoundName(matchCount, round)
  }
  return round > data.scheduledRounds ? 'Late entry' : `Round ${round}`
}

function Fixtures({ data }: { data: Data }) {
  // Read once per render; good enough for "2d 4h left" labels.
  const now = Date.now()
  const viewerId = useAdmin().user?.id ?? null
  if (data.matches.length === 0) {
    return <Empty>Fixtures appear once the organiser starts it.</Empty>
  }
  return (
    <div className="space-y-5">
      {byRound(data.matches).map(([round, matches]) => (
        <section key={round} className="space-y-2">
          <h2 className="kicker">{roundLabel(data, round, matches.length)}</h2>
          {matches.map((match) => (
            <FixtureCard key={match.id} match={match} now={now}>
              {data.competition.format === 'groups' &&
                match.groupNo !== null && (
                  <p className="mt-1.5 text-center text-xs font-medium text-muted-foreground">
                    Group {groupName(match.groupNo)}
                  </p>
                )}
              {data.competition.format === 'knockout' &&
                data.competition.legs === 2 &&
                !match.bye && (
                  <p className="mt-1.5 text-center text-xs font-medium text-muted-foreground">
                    {match.leg >= 3 ? 'Decider' : `Leg ${match.leg} of 2`}
                  </p>
                )}
              {decidable(data, match) && (
                <DecideMatch
                  slug={data.competition.slug}
                  match={match}
                  format={data.competition.format}
                  twoLegs={data.competition.legs === 2}
                />
              )}
              {concedable(data, match, viewerId) && (
                <ConcedeButton
                  slug={data.competition.slug}
                  matchId={match.id}
                  opponent={displayName(
                    (match.home?.id === viewerId
                      ? match.away
                      : match.home) as PlayerView,
                  )}
                />
              )}
            </FixtureCard>
          ))}
        </section>
      ))}
    </div>
  )
}

/** The organiser can settle any real pairing while it runs. */
function decidable(data: Data, match: MatchView) {
  return (
    data.canManage &&
    data.competition.status === 'running' &&
    match.home !== null &&
    match.away !== null
  )
}

/** A challenge's running score: a win a point, a draw half, a walkover a point. */
function ChallengeScore({
  matches,
  finished,
}: {
  matches: MatchView[]
  finished: boolean
}) {
  const [first] = matches
  if (!first?.home || !first.away) return null
  const [a, b] = [first.home, first.away]
  let scoreA = 0
  let scoreB = 0
  for (const m of matches) {
    if (m.status === 'void') continue
    if (m.result === 'draw') {
      scoreA += 0.5
      scoreB += 0.5
      continue
    }
    const winner =
      m.winnerId ??
      (m.homeWon === null ? null : m.homeWon ? m.home?.id : m.away?.id)
    if (winner === a.id) scoreA++
    else if (winner === b.id) scoreB++
  }
  const show = (n: number) => (n % 1 ? `${Math.floor(n) || ''}½` : String(n))
  return (
    <section
      aria-label="Score"
      className="rounded-2xl bg-card px-4 py-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <PlayerChip username={displayName(a)} image={a.image} />
        <p className="display numeric shrink-0 text-3xl">
          {show(scoreA)}
          <span className="px-1.5 text-muted-foreground">:</span>
          {show(scoreB)}
        </p>
        <PlayerChip username={displayName(b)} image={b.image} />
      </div>
      {finished && scoreA === scoreB && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Drawn match: neither could be caught.
        </p>
      )}
    </section>
  )
}

/** The viewer's own undecided match: they may hand the opponent the walkover. */
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

/** Knockout rounds side by side as a compact list of pairings. */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
      {children}
    </p>
  )
}
