import type { CompetitionPage } from '@misri/api-client'
import {
  EARLY_HELP,
  EARLY_LABEL,
  LEAVE_HELP,
  LEAVE_LABEL,
  POINT_KEYS,
  POINT_LABEL,
  TIE_LABEL,
  UNPLAYED_HELP,
  UNPLAYED_LABEL,
} from '@misri/core/formats'
import {
  clockLabel,
  PRESETS,
  SPEEDS,
  speedLabel,
  speedOf,
} from '@misri/core/time-control'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import {
  Accordion,
  Button,
  Card,
  Input,
  Label,
  RadioGroup,
  Separator,
  Spinner,
  TextField,
} from 'heroui-native'
import { useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { FormError } from '@/auth-shell'
import { Kicker } from '@/competitions'
import { CheckField, Choice, Hint, NumberField } from '@/form'
import { Icon } from '@/icon'
import { SITE_URL } from '@/lib/config'
import { useSession } from '@/lib/session'
import {
  Confirm,
  displayName,
  FixtureCard,
  type MatchView,
  PlayerAvatar,
  type PlayerView,
} from '@/match'

type Data = CompetitionPage
type Settings = Data['competition']
type Patch = Partial<{
  visibility: Settings['visibility']
  allowLateEntry: boolean
  unplayedRule: Settings['unplayedRule']
  points: Settings['points']
  leaveRule: Settings['leaveRule']
  earlyRounds: Settings['earlyRounds']
  timeControl: string
  tieBreaks: Settings['tieBreaks']
  startsOn: string | null
  maxPlayers: number | null
  requireApproval: boolean
}>

const startDayOf = (startsAt: number | null) =>
  startsAt ? new Date(startsAt).toISOString().slice(0, 10) : null

/** The website's organiser panel: invite code, settings, decisions, start. */
export function OwnerPanel({
  data,
  reload,
}: {
  data: Data
  reload: () => void
}) {
  const { api } = useSession()
  const { competition, members } = data
  const league = competition.format === 'league'
  const challenge = competition.format === 'challenge'
  const finished = competition.status === 'finished'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // changes not yet reloaded: each save sends them all
  const pending = useRef<Patch>({})

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      reload()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = (patch: Patch) => {
    pending.current = { ...pending.current, ...patch }
    return run(async () =>
      api?.act('updateCompetitionSettings', {
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
        ...pending.current,
      }),
    ).finally(() => {
      pending.current = {}
    })
  }

  const canTakePlayers =
    competition.status === 'open' ||
    (league && competition.status === 'running' && competition.allowLateEntry)
  const speed = speedOf(competition.timeControl)

  return (
    <Card>
      <Card.Body className="gap-5">
        <Kicker>Organiser</Kicker>

        {canTakePlayers && competition.inviteCode && (
          <View className="gap-2">
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <Kicker>Invite code</Kicker>
                <Text className="font-display text-3xl tracking-[4px] text-foreground">
                  {competition.inviteCode}
                </Text>
              </View>
              <Button
                variant="secondary"
                onPress={async () => {
                  await Clipboard.setStringAsync(
                    `${SITE_URL}/join/${competition.inviteCode}`,
                  )
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                <Icon name={copied ? 'Check' : 'Copy'} size={16} />
                <Button.Label>{copied ? 'Copied' : 'Copy link'}</Button.Label>
              </Button>
            </View>
            <Confirm
              trigger={(open) => (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onPress={open}
                >
                  New code
                </Button>
              )}
              title="Make a new invite code?"
              description="The old code and every link with it stop working. Share the new one with anyone still to join."
              confirmLabel="Make new code"
              onConfirm={async () => {
                await api?.act('newInviteCode', { slug: competition.slug })
                reload()
              }}
            />
          </View>
        )}

        <JoinRequests
          slug={competition.slug}
          requests={data.requests}
          onDone={reload}
        />

        {data.earlyRound !== null && (
          <View className="flex-row items-center gap-3 rounded-2xl bg-accent/10 p-3">
            <Text className="font-normal flex-1 text-sm text-foreground">
              Everyone has played. Open round {data.earlyRound} now? Its
              deadline stays the same.
            </Text>
            <Button
              size="sm"
              isDisabled={busy}
              onPress={() =>
                run(async () =>
                  api?.act('openEarlyRound', { slug: competition.slug }),
                )
              }
            >
              {`Open round ${data.earlyRound}`}
            </Button>
          </View>
        )}

        {data.awaitingDecision.length > 0 && (
          <View className="gap-2">
            <Text className="font-medium text-sm text-foreground">
              Needs your call ({data.awaitingDecision.length})
            </Text>
            <Hint>
              These ran out of time without a result. Award a walkover, call it
              off or give more time.
            </Hint>
            {data.matches
              .filter((m) => data.awaitingDecision.includes(m.id))
              .map((match) => (
                <FixtureCard key={match.id} match={match} now={Date.now()}>
                  <DecideMatch data={data} match={match} onDone={reload} />
                </FixtureCard>
              ))}
          </View>
        )}

        {(competition.format === 'knockout' ||
          competition.format === 'groups') &&
          competition.status === 'open' &&
          members.length >= 2 && (
            <Seeding
              slug={competition.slug}
              members={members}
              onDone={reload}
            />
          )}

        <FormError message={error} />

        {competition.status === 'open' && (
          <Button
            size="lg"
            isDisabled={busy || members.length < 2}
            onPress={() =>
              run(async () =>
                api?.act('startCompetition', { slug: competition.slug }),
              )
            }
          >
            {busy ? (
              <Spinner size="sm" />
            ) : (
              <Button.Label>
                {members.length < 2 ? 'Start (needs 2 players)' : 'Start'}
              </Button.Label>
            )}
          </Button>
        )}

        <Accordion selectionMode="single" variant="surface">
          <Accordion.Item value="settings">
            <Accordion.Trigger>
              <Text className="font-medium text-sm text-foreground">
                Settings
              </Text>
              <Accordion.Indicator />
            </Accordion.Trigger>
            <Accordion.Content>
              <View className="gap-5">
                {!finished && (
                  <Rename
                    slug={competition.slug}
                    name={competition.name}
                    onDone={reload}
                  />
                )}

                {!challenge && !finished && (
                  <NumberField
                    key={competition.maxPlayers ?? 'none'}
                    label="Most players"
                    value={competition.maxPlayers}
                    onChange={(maxPlayers) => save({ maxPlayers })}
                    min={2}
                    max={256}
                    optional
                    placeholder="No limit"
                    help="Leave it empty for no limit. Once full, nobody else can join."
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

                {!challenge && !finished && (
                  <CheckField
                    label="Approve each player"
                    description="Joining sends you a request instead of letting them straight in."
                    value={competition.requireApproval}
                    onChange={(requireApproval) => save({ requireApproval })}
                  />
                )}

                {league && !finished && (
                  <CheckField
                    label="Allow late entry"
                    description="Players can still join after it starts."
                    value={competition.allowLateEntry}
                    onChange={(allowLateEntry) => save({ allowLateEntry })}
                  />
                )}

                {!challenge && competition.status === 'open' && (
                  <StartDate
                    key={competition.startsAt ?? 'none'}
                    value={startDayOf(competition.startsAt)}
                    onChange={(startsOn) => save({ startsOn })}
                  />
                )}

                {league && !finished && (
                  <View className="gap-1.5">
                    <Label>Level on points</Label>
                    <View className="rounded-2xl bg-surface-secondary">
                      {competition.tieBreaks.map((key, i) => (
                        <View
                          key={key}
                          className="flex-row items-center gap-2 px-3 py-1.5"
                        >
                          <Text className="font-bold w-5 text-xs text-muted">
                            {i + 1}
                          </Text>
                          <Text className="font-normal flex-1 text-sm text-foreground">
                            {TIE_LABEL[key]}
                          </Text>
                          {[-1, 1].map((step) => (
                            <Button
                              key={step}
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              accessibilityLabel={`Move ${TIE_LABEL[key]} ${step < 0 ? 'up' : 'down'}`}
                              isDisabled={
                                busy ||
                                i + step < 0 ||
                                i + step >= competition.tieBreaks.length
                              }
                              onPress={() => {
                                const order = [...competition.tieBreaks]
                                ;[order[i], order[i + step]] = [
                                  order[i + step],
                                  order[i],
                                ]
                                save({ tieBreaks: order })
                              }}
                            >
                              <Icon
                                name={step < 0 ? 'ChevronUp' : 'ChevronDown'}
                                size={16}
                              />
                            </Button>
                          ))}
                        </View>
                      ))}
                    </View>
                    <Hint>
                      Head-to-head is the points they took off each other. Still
                      level: by name.
                    </Hint>
                  </View>
                )}

                {competition.status === 'open' &&
                  competition.resultSource === 'chesscom' && (
                    <View className="gap-3">
                      <Choice
                        label="Time control"
                        value={speed ?? 'any'}
                        onChange={(timeControl) => save({ timeControl })}
                        options={[
                          { value: 'any', label: 'Any' },
                          ...SPEEDS.map((s) => ({
                            value: s,
                            label: speedLabel(s),
                          })),
                        ]}
                      />
                      {speed && (
                        <Choice
                          label="Clock"
                          value={competition.timeControl}
                          onChange={(timeControl) => save({ timeControl })}
                          options={[
                            { value: speed, label: 'Any' },
                            ...PRESETS[speed].map((p) => ({
                              value: p,
                              label: clockLabel(p).replace(' per move', ''),
                            })),
                          ]}
                        />
                      )}
                    </View>
                  )}

                {!finished && league && (
                  <>
                    <Choice
                      label="When a match isn't played in time"
                      value={competition.unplayedRule}
                      onChange={(unplayedRule) => save({ unplayedRule })}
                      options={(
                        Object.keys(
                          UNPLAYED_LABEL,
                        ) as Settings['unplayedRule'][]
                      ).map((value) => ({
                        value,
                        label: UNPLAYED_LABEL[value],
                      }))}
                      help={`${UNPLAYED_HELP[competition.unplayedRule]} You can award a walkover yourself at any time.`}
                    />
                    <View className="gap-1.5">
                      <Label>Points</Label>
                      <View className="flex-row gap-2">
                        {POINT_KEYS.map((key) => (
                          <NumberField
                            key={`${key}:${competition.points[key]}`}
                            compact
                            label={POINT_LABEL[key]}
                            value={competition.points[key]}
                            min={-10}
                            max={10}
                            onChange={(n) =>
                              n !== null &&
                              save({
                                points: { ...competition.points, [key]: n },
                              })
                            }
                          />
                        ))}
                      </View>
                    </View>
                    <Choice
                      label="When a round finishes early"
                      value={competition.earlyRounds}
                      onChange={(earlyRounds) => save({ earlyRounds })}
                      options={(
                        Object.keys(EARLY_LABEL) as Settings['earlyRounds'][]
                      ).map((value) => ({ value, label: EARLY_LABEL[value] }))}
                      help={`${EARLY_HELP[competition.earlyRounds]}${
                        competition.earlyRounds !== 'wait'
                          ? ' Players are told; deadlines stay the same, so playing early is optional.'
                          : ''
                      }`}
                    />
                  </>
                )}

                {league && !finished && (
                  <Choice
                    label="If a player leaves after it starts"
                    value={competition.leaveRule}
                    onChange={(leaveRule) => save({ leaveRule })}
                    options={(
                      Object.keys(LEAVE_LABEL) as Settings['leaveRule'][]
                    ).map((rule) => ({
                      value: rule,
                      label: LEAVE_LABEL[rule],
                    }))}
                    help={`${LEAVE_HELP[competition.leaveRule]} They can't rejoin once it has started.`}
                  />
                )}

                <Separator />
                <HandOver
                  slug={competition.slug}
                  members={members.filter((m) => m.id !== competition.ownerId)}
                  onDone={reload}
                />
                <DeleteCompetition
                  slug={competition.slug}
                  name={competition.name}
                />
              </View>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </Card.Body>
    </Card>
  )
}

function Rename({
  slug,
  name,
  onDone,
}: {
  slug: string
  name: string
  onDone: () => void
}) {
  const { api } = useSession()
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = value.trim() !== name && value.trim().length > 0
  return (
    <View className="gap-1.5">
      <TextField isInvalid={Boolean(error)}>
        <Label>Name</Label>
        <View className="flex-row gap-2">
          <Input
            className="flex-1"
            maxLength={60}
            value={value}
            onChangeText={setValue}
          />
          <Button
            variant="secondary"
            isDisabled={!changed || busy}
            onPress={async () => {
              setBusy(true)
              setError(null)
              try {
                await api?.act('renameCompetition', { slug, name: value })
                onDone()
              } catch (cause) {
                setError((cause as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            Save
          </Button>
        </View>
      </TextField>
      <FormError message={error} />
    </View>
  )
}

/** Optional start day as YYYY-MM-DD; it starts that morning (08:00 Nairobi). */
function StartDate({
  value,
  onChange,
}: {
  value: string | null
  onChange: (day: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(draft) && !Number.isNaN(Date.parse(draft))
  return (
    <View className="gap-1.5">
      <TextField isInvalid={draft !== '' && !valid}>
        <Label>Start date (optional)</Label>
        <View className="flex-row gap-2">
          <Input
            className="flex-1"
            value={draft}
            onChangeText={setDraft}
            placeholder="2026-12-01"
            keyboardType="numbers-and-punctuation"
            onBlur={() => valid && draft !== value && onChange(draft)}
          />
          {value && (
            <Button
              variant="ghost"
              onPress={() => {
                setDraft('')
                onChange(null)
              }}
            >
              Clear
            </Button>
          )}
        </View>
      </TextField>
      <Hint>
        It starts that morning (08:00 Nairobi) if you haven't started it.
        Everyone is told.
      </Hint>
    </View>
  )
}

function JoinRequests({
  slug,
  requests,
  onDone,
}: {
  slug: string
  requests: PlayerView[]
  onDone: () => void
}) {
  const { api } = useSession()
  const [busy, setBusy] = useState<string | null>(null)
  if (requests.length === 0) return null
  const reply = async (userId: string, approve: boolean) => {
    setBusy(userId)
    try {
      await api?.act('answerRequest', { slug, userId, approve })
      onDone()
    } finally {
      setBusy(null)
    }
  }
  return (
    <View className="gap-2">
      <Text className="font-medium text-sm text-foreground">
        Asking to join ({requests.length})
      </Text>
      {requests.map((r) => (
        <View
          key={r.id}
          className="flex-row items-center gap-2 rounded-2xl bg-surface-secondary px-3 py-2"
        >
          <PlayerAvatar player={r} size="sm" />
          <Text
            numberOfLines={1}
            className="flex-1 font-medium text-sm text-foreground"
          >
            {displayName(r)}
          </Text>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={busy === r.id}
            onPress={() => reply(r.id, false)}
          >
            Decline
          </Button>
          <Button
            size="sm"
            isDisabled={busy === r.id}
            onPress={() => reply(r.id, true)}
          >
            Approve
          </Button>
        </View>
      ))}
    </View>
  )
}

function Seeding({
  slug,
  members,
  onDone,
}: {
  slug: string
  members: PlayerView[]
  onDone: () => void
}) {
  const { api } = useSession()
  const [busy, setBusy] = useState<'rating' | 'move' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const save = async (order: string[] | 'rating') => {
    setBusy(order === 'rating' ? 'rating' : 'move')
    setError(null)
    try {
      await api?.act('seedCompetition', { slug, order })
      onDone()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const move = (from: number, to: number) => {
    const order = members.map((m) => m.id)
    ;[order[from], order[to]] = [order[to], order[from]]
    void save(order)
  }
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Text className="font-medium text-sm text-foreground">Seeding</Text>
          <Hint>Top seeds meet late and get any byes.</Hint>
        </View>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy !== null}
          onPress={() => save('rating')}
        >
          {busy === 'rating' ? (
            <Spinner size="sm" />
          ) : (
            <Button.Label>By chess.com rating</Button.Label>
          )}
        </Button>
      </View>
      <View className="rounded-2xl bg-surface-secondary">
        {members.map((member, i) => (
          <View
            key={member.id}
            className="flex-row items-center gap-2 px-3 py-1.5"
          >
            <Text className="font-bold w-5 text-xs text-muted">{i + 1}</Text>
            <PlayerAvatar player={member} size="sm" />
            <Text
              numberOfLines={1}
              className="flex-1 font-normal text-sm text-foreground"
            >
              {displayName(member)}
            </Text>
            {[-1, 1].map((step) => (
              <Button
                key={step}
                variant="ghost"
                size="sm"
                isIconOnly
                accessibilityLabel={`Move ${displayName(member)} ${step < 0 ? 'up' : 'down'}`}
                isDisabled={
                  busy !== null || i + step < 0 || i + step >= members.length
                }
                onPress={() => move(i, i + step)}
              >
                <Icon name={step < 0 ? 'ChevronUp' : 'ChevronDown'} size={16} />
              </Button>
            ))}
          </View>
        ))}
      </View>
      <FormError message={error} />
    </View>
  )
}

// the API's decideMatch decision shape
type Decision =
  | { kind: 'result'; result: 'white' | 'black' | 'draw'; homeWhite: true }
  | { kind: 'walkover'; winnerUserId: string }
  | { kind: 'extend'; days: number }
  | { kind: 'void' }
  | { kind: 'reopen' }

/** What the organiser may do with a match, in the website's words. */
function optionsFor(
  match: MatchView,
  format: Settings['format'],
  leg: boolean,
) {
  const home = match.home ? displayName(match.home) : 'Home'
  const away = match.away ? displayName(match.away) : 'Away'
  const league = format !== 'knockout'
  const decided = ['played', 'walkover', 'void'].includes(match.status)
  const options: Array<{ key: string; label: string; decision: Decision }> = [
    {
      key: 'home-won',
      label: `${home} won`,
      decision: { kind: 'result', result: 'white', homeWhite: true },
    },
    ...(league || leg
      ? [
          {
            key: 'draw',
            label: 'Draw',
            decision: {
              kind: 'result',
              result: 'draw',
              homeWhite: true,
            } as Decision,
          },
        ]
      : []),
    {
      key: 'away-won',
      label: `${away} won`,
      decision: { kind: 'result', result: 'black', homeWhite: true },
    },
    {
      key: 'wo-home',
      label: `Walkover to ${home}`,
      decision: { kind: 'walkover', winnerUserId: match.home?.id ?? '' },
    },
    {
      key: 'wo-away',
      label: `Walkover to ${away}`,
      decision: { kind: 'walkover', winnerUserId: match.away?.id ?? '' },
    },
    {
      key: 'extend-2',
      label: '2 more days',
      decision: { kind: 'extend', days: 2 },
    },
    {
      key: 'extend-7',
      label: '7 more days',
      decision: { kind: 'extend', days: 7 },
    },
    ...(league
      ? [
          {
            key: 'void',
            label: 'Call it off',
            decision: { kind: 'void' } as Decision,
          },
        ]
      : []),
    ...(decided
      ? [
          {
            key: 'reopen',
            label: 'Reopen it',
            decision: { kind: 'reopen' } as Decision,
          },
        ]
      : []),
  ]
  return options
}

/** The organiser settles one match: pick what happened, add a word, save. */
export function DecideMatch({
  data,
  match,
  onDone,
}: {
  data: Data
  match: MatchView
  onDone: () => void
}) {
  const { api } = useSession()
  const options = optionsFor(
    match,
    data.competition.format,
    data.competition.legs === 2,
  )
  const [chosen, setChosen] = useState('')
  const [note, setNote] = useState('')
  const pick = options.find((o) => o.key === chosen)
  const title = `${match.home ? displayName(match.home) : 'Home'} v ${
    match.away ? displayName(match.away) : 'Away'
  }`
  return (
    <Confirm
      trigger={(open) => (
        <Button variant="secondary" size="sm" className="mt-2" onPress={open}>
          Decide this match
        </Button>
      )}
      title={title}
      description="Pick what happened. It replaces any result already there."
      confirmLabel="Save"
      isDisabled={!pick}
      onConfirm={async () => {
        if (!pick || !api) return
        await api.act('decideMatch', {
          slug: data.competition.slug,
          matchId: match.id,
          decision: pick.decision,
          note,
        })
        setChosen('')
        setNote('')
        onDone()
      }}
    >
      <View className="mb-3 gap-3">
        <RadioGroup value={chosen} onValueChange={setChosen}>
          {options.map((o) => (
            <RadioGroup.Item key={o.key} value={o.key}>
              {o.label}
            </RadioGroup.Item>
          ))}
        </RadioGroup>
        <TextField>
          <Label>Note for the players (optional)</Label>
          <Input value={note} onChangeText={setNote} maxLength={200} />
        </TextField>
      </View>
    </Confirm>
  )
}

function HandOver({
  slug,
  members,
  onDone,
}: {
  slug: string
  members: PlayerView[]
  onDone: () => void
}) {
  const { api } = useSession()
  const [to, setTo] = useState('')
  const chosen = members.find((m) => m.id === to)
  if (members.length === 0) return null
  return (
    <Confirm
      trigger={(open) => (
        <Button variant="secondary" onPress={open}>
          Hand it over
        </Button>
      )}
      title="Make someone else the organiser?"
      description="They get every organiser power and you become a regular player. Only they can hand it back."
      confirmLabel={
        chosen ? `Hand over to ${displayName(chosen)}` : 'Hand over'
      }
      isDisabled={!chosen}
      onConfirm={async () => {
        await api?.act('handOverCompetition', { slug, toUserId: to })
        onDone()
      }}
    >
      <RadioGroup value={to} onValueChange={setTo} className="mb-3">
        {members.map((m) => (
          <RadioGroup.Item key={m.id} value={m.id}>
            {displayName(m)}
          </RadioGroup.Item>
        ))}
      </RadioGroup>
    </Confirm>
  )
}

function DeleteCompetition({ slug, name }: { slug: string; name: string }) {
  const { api } = useSession()
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase()
  return (
    <Confirm
      trigger={(open) => (
        <Button variant="danger-soft" onPress={open}>
          Delete competition
        </Button>
      )}
      title={`Delete ${name}?`}
      description="Every fixture, result and player list goes, for everyone. This can't be undone. Type its name to confirm."
      confirmLabel="Delete"
      danger
      isDisabled={!matches}
      onConfirm={async () => {
        await api?.act('deleteCompetition', { slug, confirmName: typed })
        router.replace('/')
      }}
    >
      <TextField className="mb-3">
        <Input placeholder={name} value={typed} onChangeText={setTyped} />
      </TextField>
    </Confirm>
  )
}

/** The organiser takes a player out, under the same rules as leaving. */
export function RemovePlayer({
  data,
  player,
  onDone,
}: {
  data: Data
  player: PlayerView
  onDone: () => void
}) {
  const { api } = useSession()
  const { competition } = data
  const name = displayName(player)
  const started = competition.status !== 'open'
  const consequence = !started
    ? `${name} can join again later.`
    : competition.format === 'knockout'
      ? `Their opponent goes through, and ${name} can't rejoin.`
      : `${LEAVE_HELP[competition.leaveRule]} ${name} can't rejoin.`
  return (
    <Confirm
      trigger={(open) => (
        <Button variant="ghost" size="sm" onPress={open}>
          <Button.Label className="text-danger">Remove</Button.Label>
        </Button>
      )}
      title={`Remove ${name}?`}
      description={consequence}
      confirmLabel="Remove"
      danger
      onConfirm={async () => {
        await api?.act('removePlayer', {
          slug: competition.slug,
          userId: player.id,
        })
        onDone()
      }}
    />
  )
}
