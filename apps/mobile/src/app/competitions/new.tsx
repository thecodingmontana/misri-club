import { BEST_OF } from '@misri/core/challenge'
import { normalizeName } from '@misri/core/competition-names'
import {
  FORMAT_INFO,
  LEAVE_HELP,
  LEAVE_LABEL,
  POINT_KEYS,
  POINT_LABEL,
  UNPLAYED_HELP,
  UNPLAYED_LABEL,
} from '@misri/core/formats'
import { ADVANCING, GROUP_COUNTS } from '@misri/core/groups'
import type { LeaveRule } from '@misri/core/leave'
import { POINTS, type Points, type UnplayedRule } from '@misri/core/standings'
import {
  clockLabel,
  PRESETS,
  SPEEDS,
  speedLabel,
  speedOf,
} from '@misri/core/time-control'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import {
  Button,
  Card,
  Chip,
  Input,
  Label,
  Spinner,
  TextField,
  useThemeColor,
} from 'heroui-native'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native'
import { FormError } from '@/auth-shell'
import { FormatExplainer, PageTitle } from '@/competitions'
import { CheckField, Choice, Hint, NumberField } from '@/form'
import { Icon } from '@/icon'
import { useSession } from '@/lib/session'

type Format = 'league' | 'knockout' | 'challenge' | 'groups'
const FORMATS: Format[] = ['league', 'knockout', 'challenge', 'groups']
const MIN_NAME = 3

const TITLE: Record<Format, string> = {
  league: 'New league',
  knockout: 'New tournament',
  challenge: 'New challenge',
  groups: 'New groups + knockout',
}

/** Whether the typed name is free (once typing pauses) and names to offer. */
function useNameCheck(name: string) {
  const { api } = useSession()
  const [available, setAvailable] = useState<boolean | undefined>()
  const [chips, setChips] = useState<string[]>([])
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    setAvailable(undefined)
    const typed = name.trim()
    if (!api || normalizeName(typed).length < MIN_NAME) return
    let live = true
    const id = setTimeout(() => {
      api
        .competitionNameCheck(typed)
        .then((result) => {
          if (!live) return
          setAvailable(result.available)
          if (!result.available) setChips(result.suggestions)
        })
        .catch(() => {})
    }, 400)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [api, name])

  async function suggest() {
    if (!api) return
    setSuggesting(true)
    try {
      setChips(await api.competitionNameIdeas())
    } finally {
      setSuggesting(false)
    }
  }
  return { available, chips, suggesting, suggest }
}

/** The website's create form, field for field. */
export default function NewCompetition() {
  const params = useLocalSearchParams<{ format?: string }>()
  const format: Format = FORMATS.includes(params.format as Format)
    ? (params.format as Format)
    : 'league'
  const { api } = useSession()
  const [accent, onAccent] = useThemeColor(['accent', 'accent-foreground'])
  const [name, setName] = useState('')
  const [legs, setLegs] = useState<1 | 2>(1)
  const [bestOf, setBestOf] = useState<(typeof BEST_OF)[number]>(3)
  const [groupCount, setGroupCount] = useState<(typeof GROUP_COUNTS)[number]>(2)
  const [advancing, setAdvancing] = useState<(typeof ADVANCING)[number]>(2)
  const [matchdayDays, setMatchdayDays] = useState(2)
  const [timeControl, setTimeControl] = useState('any')
  const [resultSource, setResultSource] = useState<'chesscom' | 'manual'>(
    'chesscom',
  )
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [leaveRule, setLeaveRule] = useState<LeaveRule>('award')
  const [maxPlayers, setMaxPlayers] = useState<number | null>(null)
  const [requireApproval, setRequireApproval] = useState(false)
  const [unplayedRule, setUnplayedRule] = useState<UnplayedRule>('organiser')
  const [points, setPoints] = useState<Points>(POINTS)
  const [allowLateEntry, setAllowLateEntry] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const league = format === 'league'
  const challenge = format === 'challenge'
  const groups = format === 'groups'
  const nameCheck = useNameCheck(name)
  const speed = speedOf(timeControl)

  async function create() {
    if (!api) return
    setBusy(true)
    setError(null)
    try {
      const { slug } = await api.act('createCompetition', {
        name,
        format,
        legs: challenge ? 1 : legs,
        bestOf: challenge ? bestOf : 1,
        groupCount,
        advancing,
        matchdayDays,
        timeControl: resultSource === 'chesscom' ? timeControl : 'any',
        resultSource,
        visibility,
        allowLateEntry: league && allowLateEntry,
        maxPlayers,
        requireApproval,
        ...(league ? { unplayedRule, points, leaveRule } : {}),
      })
      router.replace(`/c/${slug}`)
    } catch (cause) {
      setError((cause as Error).message)
      setBusy(false)
    }
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: '' }} />
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          contentContainerClassName="gap-5 p-4 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          <PageTitle title={TITLE[format]} lead={FORMAT_INFO[format].summary} />
          <FormatExplainer format={format} />

          <Card>
            <Card.Body className="gap-5">
              <View className="gap-1.5">
                <TextField isInvalid={nameCheck.available === false}>
                  <Label>Name</Label>
                  <View className="flex-row items-center gap-2">
                    <Input
                      className="flex-1"
                      maxLength={60}
                      value={name}
                      onChangeText={setName}
                      placeholder={
                        league
                          ? 'Friday league'
                          : challenge
                            ? 'Grudge match'
                            : 'Summer cup'
                      }
                    />
                    <Button
                      variant="ghost"
                      isIconOnly
                      accessibilityLabel="Suggest a name"
                      isDisabled={nameCheck.suggesting}
                      onPress={nameCheck.suggest}
                    >
                      {nameCheck.suggesting ? (
                        <Spinner size="sm" />
                      ) : (
                        <Icon name="MagicWand" color={accent} />
                      )}
                    </Button>
                  </View>
                </TextField>
                {nameCheck.available === true && (
                  <Text className="font-medium text-xs text-accent">
                    ✓ Available
                  </Text>
                )}
                {nameCheck.available === false && (
                  <Text className="font-medium text-xs text-danger">
                    Already taken
                  </Text>
                )}
                {nameCheck.chips.length > 0 && (
                  <View className="flex-row flex-wrap gap-2">
                    {nameCheck.chips.map((chip) => (
                      <Chip
                        key={chip}
                        variant="secondary"
                        onPress={() => setName(chip)}
                      >
                        {chip}
                      </Chip>
                    ))}
                  </View>
                )}
              </View>

              {!challenge && (
                <Choice
                  label={
                    league || groups ? 'Games per pairing' : 'Games per tie'
                  }
                  value={legs}
                  onChange={setLegs}
                  options={[
                    { value: 1, label: 'Single' },
                    { value: 2, label: 'Home & away' },
                  ]}
                />
              )}

              {groups && (
                <>
                  <Choice
                    label="Groups"
                    value={groupCount}
                    onChange={setGroupCount}
                    options={GROUP_COUNTS.map((n) => ({
                      value: n,
                      label: String(n),
                    }))}
                  />
                  <Choice
                    label="Go through from each group"
                    value={advancing}
                    onChange={setAdvancing}
                    options={ADVANCING.map((n) => ({
                      value: n,
                      label: n === 1 ? 'Winner' : `Top ${n}`,
                    }))}
                  />
                </>
              )}

              {challenge && (
                <Choice
                  label="Best of"
                  value={bestOf}
                  onChange={setBestOf}
                  options={BEST_OF.map((n) => ({ value: n, label: String(n) }))}
                />
              )}

              <NumberField
                live
                label={challenge ? 'Days to play' : 'Days per round'}
                value={matchdayDays}
                onChange={(n) => n !== null && setMatchdayDays(n)}
                min={1}
                max={14}
                help={
                  challenge
                    ? 'How long you both have to play every game.'
                    : 'How long players have to play each game.'
                }
              />

              <Choice
                label="Results"
                value={resultSource}
                onChange={setResultSource}
                options={[
                  { value: 'chesscom', label: 'From chess.com' },
                  { value: 'manual', label: 'Players report' },
                ]}
                help={
                  resultSource === 'chesscom'
                    ? 'Games played on chess.com count by themselves. Everyone needs a linked chess.com account.'
                    : 'For over the board, lichess or anywhere else: a player reports each result and their opponent confirms it. No chess.com account needed.'
                }
              />

              {resultSource === 'chesscom' && (
                <View className="gap-3">
                  <Choice
                    label="Time control"
                    value={speed ?? 'any'}
                    onChange={setTimeControl}
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
                      value={timeControl}
                      onChange={setTimeControl}
                      options={[
                        { value: speed, label: 'Any' },
                        ...PRESETS[speed].map((preset) => ({
                          value: preset,
                          label: clockLabel(preset).replace(' per move', ''),
                        })),
                      ]}
                    />
                  )}
                  <Hint>
                    Only chess.com games played at this time control count as
                    results.
                  </Hint>
                </View>
              )}

              {!challenge && (
                <NumberField
                  live
                  label="Most players"
                  value={maxPlayers}
                  onChange={setMaxPlayers}
                  min={2}
                  max={256}
                  optional
                  placeholder="No limit"
                  help="Leave it empty for no limit. Once full, nobody else can join."
                />
              )}

              {!challenge && (
                <CheckField
                  label="Approve each player"
                  description="Joining sends you a request instead of letting them straight in."
                  value={requireApproval}
                  onChange={setRequireApproval}
                />
              )}

              {!challenge && (
                <Choice
                  label="Who can join"
                  value={visibility}
                  onChange={setVisibility}
                  options={[
                    { value: 'private', label: 'Invite only' },
                    { value: 'public', label: 'Anyone' },
                  ]}
                />
              )}

              {league && (
                <CheckField
                  label="Allow late entry"
                  description="Players can still join after it starts."
                  value={allowLateEntry}
                  onChange={setAllowLateEntry}
                />
              )}

              {league ? (
                <>
                  <Choice
                    label="When a match isn't played in time"
                    value={unplayedRule}
                    onChange={setUnplayedRule}
                    options={(
                      Object.keys(UNPLAYED_LABEL) as UnplayedRule[]
                    ).map((value) => ({ value, label: UNPLAYED_LABEL[value] }))}
                    help={`${UNPLAYED_HELP[unplayedRule]} You can award a walkover yourself at any time.`}
                  />
                  <View className="gap-1.5">
                    <Label>Points</Label>
                    <View className="flex-row gap-2">
                      {POINT_KEYS.map((key) => (
                        <NumberField
                          live
                          key={key}
                          compact
                          label={POINT_LABEL[key]}
                          value={points[key]}
                          min={-10}
                          max={10}
                          onChange={(n) =>
                            n !== null && setPoints({ ...points, [key]: n })
                          }
                        />
                      ))}
                    </View>
                    <Hint>
                      A walkover counts as a win for one and a forfeit for the
                      other.
                    </Hint>
                  </View>
                  <Choice
                    label="If a player leaves after it starts"
                    value={leaveRule}
                    onChange={setLeaveRule}
                    options={(Object.keys(LEAVE_LABEL) as LeaveRule[]).map(
                      (rule) => ({ value: rule, label: LEAVE_LABEL[rule] }),
                    )}
                    help={`${LEAVE_HELP[leaveRule]} They can't rejoin once it has started.`}
                  />
                </>
              ) : (
                <Hint>Unplayed matches: the organiser decides.</Hint>
              )}

              <FormError message={error} />
              <Button
                size="lg"
                onPress={create}
                isDisabled={
                  busy || !name.trim() || nameCheck.available === false
                }
              >
                {busy ? (
                  <Spinner color={onAccent} />
                ) : (
                  <Button.Label>Create</Button.Label>
                )}
              </Button>
            </Card.Body>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
