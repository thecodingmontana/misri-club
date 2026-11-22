import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { z } from 'zod'
import { Spinner } from '#/components/auth'
import {
  LeaveRuleChoice,
  MaxPlayersField,
} from '#/components/competition-actions'
import { Choice, FORMAT_INFO, FormatExplainer } from '#/components/competitions'
import { Check, MagicWand } from '#/components/icons'
import { ScoringRules } from '#/components/scoring-rules'
import { TimeControlChoice } from '#/components/time-control'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { BEST_OF } from '#/lib/challenge'
import { normalizeName } from '#/lib/competition-names'
import { ADVANCING, GROUP_COUNTS } from '#/lib/groups'
import type { LeaveRule } from '#/lib/leave'
import { seo } from '#/lib/seo'
import { toast } from '#/lib/toast'
import {
  checkCompetitionNameFn,
  createCompetitionFn,
  suggestCompetitionNamesFn,
} from '#/server/competitions.functions'
import { POINTS, type Points, type UnplayedRule } from '#/server/standings'

export const Route = createFileRoute('/_authed/competitions/new')({
  validateSearch: z.object({
    format: z
      .enum(['league', 'knockout', 'challenge', 'groups'])
      .catch('league'),
  }),
  head: () =>
    seo({
      title: 'New competition',
      description: 'Create a league or a tournament.',
      noindex: true,
    }),
  component: NewCompetition,
})

function Field({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>
}

const NAME_CHECK_DELAY = 400
const MIN_NAME = 3

/**
 * Whether the typed name is free (checked once typing pauses), the free names
 * to offer as chips, and a way to ask for ideas while the field is empty.
 */
function useNameCheck(name: string) {
  const check = useServerFn(checkCompetitionNameFn)
  const suggest = useServerFn(suggestCompetitionNamesFn)
  const [settled, setSettled] = useState('')
  const [ideas, setIdeas] = useState<string[]>([])
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setSettled(name.trim()), NAME_CHECK_DELAY)
    return () => clearTimeout(id)
  }, [name])

  const key = normalizeName(settled)
  const result = useQuery({
    queryKey: ['competition-name', key],
    queryFn: () => check({ data: { name: settled } }),
    enabled: key.length >= MIN_NAME,
    staleTime: 30_000,
  })
  // only trust an answer about what is in the field right now
  const current =
    key.length >= MIN_NAME && key === normalizeName(name)
      ? result.data
      : undefined

  async function suggestNames() {
    setSuggesting(true)
    try {
      setIdeas(await suggest())
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSuggesting(false)
    }
  }

  return {
    available: current?.available,
    chips: current?.available === false ? current.suggestions : ideas,
    suggesting,
    suggestNames,
  }
}

function NewCompetition() {
  const { format } = Route.useSearch()
  const create = useServerFn(createCompetitionFn)
  const navigate = useNavigate()
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
  const [scoring, setScoring] = useState<{
    unplayedRule: UnplayedRule
    points: Points
  }>({ unplayedRule: 'organiser', points: POINTS })
  const [allowLateEntry, setAllowLateEntry] = useState(false)
  const [busy, setBusy] = useState(false)
  const league = format === 'league'
  const challenge = format === 'challenge'
  const groups = format === 'groups'
  const nameCheck = useNameCheck(name)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const { slug } = await create({
        data: {
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
          ...(league ? { ...scoring, leaveRule } : {}),
        },
      })
      await navigate({ to: '/c/$slug', params: { slug } })
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5 pt-2">
      <header className="text-center">
        <h1 className="display text-3xl">
          {league
            ? 'New league'
            : challenge
              ? 'New challenge'
              : groups
                ? 'New groups + knockout'
                : 'New tournament'}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {FORMAT_INFO[format].summary}
        </p>
      </header>

      <FormatExplainer format={format} open />

      <form
        className="flex flex-col gap-5 rounded-2xl bg-card p-4 shadow-card"
        onSubmit={submit}
      >
        <Field>
          <label htmlFor="competition-name" className="text-sm font-medium">
            Name
          </label>
          <div className="relative">
            <Input
              id="competition-name"
              maxLength={60}
              className="pr-11"
              placeholder={
                league
                  ? 'Friday league'
                  : challenge
                    ? 'Grudge match'
                    : 'Summer cup'
              }
              value={name}
              aria-describedby="competition-name-status"
              aria-invalid={nameCheck.available === false || undefined}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Suggest a name"
              data-tip="Suggest a name"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-primary"
              disabled={nameCheck.suggesting}
              onClick={nameCheck.suggestNames}
            >
              {nameCheck.suggesting ? <Spinner /> : <MagicWand />}
            </Button>
          </div>
          <p
            id="competition-name-status"
            aria-live="polite"
            className="min-h-4 text-xs"
          >
            {nameCheck.available === true && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Check className="size-3.5" aria-hidden />
                Available
              </span>
            )}
            {nameCheck.available === false && (
              <span className="text-destructive">Already taken</span>
            )}
          </p>
          {nameCheck.chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {nameCheck.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => setName(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
        </Field>

        {!challenge && (
          <Choice
            label={league || groups ? 'Games per pairing' : 'Games per tie'}
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

        <Field>
          <label htmlFor="matchday-days" className="text-sm font-medium">
            {challenge ? 'Days to play' : 'Days per round'}
          </label>
          <Input
            id="matchday-days"
            type="number"
            inputMode="numeric"
            min={1}
            max={14}
            value={matchdayDays}
            onChange={(event) =>
              setMatchdayDays(
                Math.min(14, Math.max(1, Number(event.target.value) || 1)),
              )
            }
          />
          <p className="text-xs text-muted-foreground">
            {challenge
              ? 'How long you both have to play every game.'
              : 'How long players have to play each game.'}
          </p>
        </Field>

        <div className="space-y-1.5">
          <Choice
            label="Results"
            value={resultSource}
            onChange={setResultSource}
            options={[
              { value: 'chesscom', label: 'From chess.com' },
              { value: 'manual', label: 'Players report' },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {resultSource === 'chesscom'
              ? 'Games played on chess.com count by themselves. Everyone needs a linked chess.com account.'
              : 'For over the board, lichess or anywhere else: a player reports each result and their opponent confirms it. No chess.com account needed.'}
          </p>
        </div>

        {resultSource === 'chesscom' && (
          <TimeControlChoice value={timeControl} onChange={setTimeControl} />
        )}

        {!challenge && (
          <MaxPlayersField value={maxPlayers} onSave={setMaxPlayers} />
        )}

        {!challenge && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={requireApproval}
              onChange={(event) => setRequireApproval(event.target.checked)}
            />
            <span>
              <span className="block font-medium">Approve each player</span>
              <span className="block text-xs text-muted-foreground">
                Joining sends you a request instead of letting them straight in.
              </span>
            </span>
          </label>
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
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={allowLateEntry}
              onChange={(event) => setAllowLateEntry(event.target.checked)}
            />
            <span>
              <span className="block font-medium">Allow late entry</span>
              <span className="block text-xs text-muted-foreground">
                Players can still join after it starts.
              </span>
            </span>
          </label>
        )}

        <ScoringRules
          format={format}
          unplayedRule={scoring.unplayedRule}
          points={scoring.points}
          onChange={setScoring}
        />

        {league && (
          <LeaveRuleChoice value={leaveRule} onChange={setLeaveRule} />
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={busy || !name.trim() || nameCheck.available === false}
        >
          {busy && <Spinner />}
          Create
        </Button>
      </form>
    </div>
  )
}
