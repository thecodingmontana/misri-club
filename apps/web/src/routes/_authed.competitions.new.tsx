import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { type FormEvent, type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Spinner } from '#/components/auth'
import { Choice } from '#/components/competitions'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { seo } from '#/lib/seo'
import { createCompetitionFn } from '#/server/competitions.functions'

export const Route = createFileRoute('/_authed/competitions/new')({
  validateSearch: z.object({
    format: z.enum(['league', 'knockout']).catch('league'),
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

function NewCompetition() {
  const { format } = Route.useSearch()
  const create = useServerFn(createCompetitionFn)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [legs, setLegs] = useState<1 | 2>(1)
  const [matchdayDays, setMatchdayDays] = useState(2)
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [allowLateEntry, setAllowLateEntry] = useState(false)
  const [busy, setBusy] = useState(false)
  const league = format === 'league'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const { slug } = await create({
        data: {
          name,
          format,
          legs: league ? legs : 1,
          matchdayDays,
          visibility,
          allowLateEntry: league && allowLateEntry,
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
          {league ? 'New league' : 'New tournament'}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {league
            ? 'Everyone plays everyone. Most points wins.'
            : 'Knockout rounds. Win to go through.'}
        </p>
      </header>

      <form
        className="flex flex-col gap-5 rounded-2xl bg-card p-4 shadow-card"
        onSubmit={submit}
      >
        <Field>
          <label htmlFor="competition-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="competition-name"
            maxLength={60}
            placeholder={league ? 'Friday league' : 'Summer cup'}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        {league && (
          <Choice
            label="Games per pairing"
            value={legs}
            onChange={setLegs}
            options={[
              { value: 1, label: 'Single' },
              { value: 2, label: 'Home & away' },
            ]}
          />
        )}

        <Field>
          <label htmlFor="matchday-days" className="text-sm font-medium">
            Days per round
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
            How long players have to play each game.
          </p>
        </Field>

        <Choice
          label="Who can join"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'private', label: 'Invite only' },
            { value: 'public', label: 'Anyone' },
          ]}
        />

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

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={busy || !name.trim()}
        >
          {busy && <Spinner />}
          Create
        </Button>
      </form>
    </div>
  )
}
