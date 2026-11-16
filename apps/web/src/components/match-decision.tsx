import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Spinner } from '#/components/auth'
import { displayName } from '#/components/match-card'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { toast } from '#/lib/toast'
import { cn } from '#/lib/utils'
import type { MatchView } from '#/server/competition-view.server'
import { decideMatchFn } from '#/server/competitions.functions'

type Decision = Parameters<typeof decideMatchFn>[0]['data']['decision']

interface Option {
  key: string
  label: string
  decision: Decision
}

/** What the organiser may do with this match, in plain words. */
function optionsFor(
  match: MatchView,
  format: 'league' | 'knockout' | 'challenge',
): Array<{ group: string; options: Option[] }> {
  const home = match.home ? displayName(match.home) : 'Home'
  const away = match.away ? displayName(match.away) : 'Away'
  // only a knockout needs someone through; leagues and challenges allow draws and call-offs
  const league = format !== 'knockout'
  const decided = ['played', 'walkover', 'void'].includes(match.status)
  const result: Option[] = [
    {
      key: 'home-won',
      label: `${home} won`,
      decision: { kind: 'result', result: 'white', homeWhite: true },
    },
    {
      key: 'away-won',
      label: `${away} won`,
      decision: { kind: 'result', result: 'black', homeWhite: true },
    },
  ]
  if (league) {
    result.splice(1, 0, {
      key: 'draw',
      label: 'Draw',
      decision: { kind: 'result', result: 'draw', homeWhite: true },
    })
  }
  const other: Option[] = [
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
  ]
  if (league) {
    other.push({
      key: 'void',
      label: 'Call it off',
      decision: { kind: 'void' },
    })
  }
  if (decided) {
    other.push({
      key: 'reopen',
      label: 'Reopen it',
      decision: { kind: 'reopen' },
    })
  }
  return [
    { group: 'Result', options: result },
    {
      group: 'Walkover (the other didn’t play)',
      options: [
        {
          key: 'wo-home',
          label: `To ${home}`,
          decision: { kind: 'walkover', winnerUserId: match.home?.id ?? '' },
        },
        {
          key: 'wo-away',
          label: `To ${away}`,
          decision: { kind: 'walkover', winnerUserId: match.away?.id ?? '' },
        },
      ],
    },
    { group: 'Other', options: other },
  ]
}

/** The organiser settles one match: pick what happened, add a word, save. */
export function DecideMatch({
  slug,
  match,
  format,
}: {
  slug: string
  match: MatchView
  format: 'league' | 'knockout' | 'challenge'
}) {
  const decide = useServerFn(decideMatchFn)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<Option | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const title = `${match.home ? displayName(match.home) : 'Home'} v ${
    match.away ? displayName(match.away) : 'Away'
  }`

  async function save() {
    if (!chosen) return
    setBusy(true)
    try {
      await decide({
        data: { slug, matchId: match.id, decision: chosen.decision, note },
      })
      await router.invalidate()
      toast.success('Decision saved')
      setOpen(false)
      setChosen(null)
      setNote('')
    } catch (error) {
      toast.error("Couldn't save that", { desc: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="secondary" size="sm" className="mt-2 w-full">
          Decide this match
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            Pick what happened. It replaces any result already there.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          {optionsFor(match, format).map(({ group, options }) => (
            <fieldset key={group} className="space-y-1.5">
              <legend className="text-sm font-medium">{group}</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={chosen?.key === option.key}
                    onClick={() => setChosen(option)}
                    className={cn(
                      'rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                      chosen?.key === option.key
                        ? 'border-primary bg-primary/12 text-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="space-y-1.5">
            <label htmlFor={`note-${match.id}`} className="text-sm font-medium">
              Note for the players (optional)
            </label>
            <Input
              id={`note-${match.id}`}
              maxLength={200}
              placeholder="e.g. No reply to the challenge"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button disabled={!chosen || busy} onClick={save}>
            {busy && <Spinner />}
            Save decision
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
