import { LEAVE_HELP, LEAVE_LABEL } from '@misri/core/formats'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { type ReactNode, useState } from 'react'
import { Choice } from '#/components/competitions'
import {
  AlertDialog,
  AlertDialogAction,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import type { EarlyRounds } from '#/lib/early-rounds'
import type { LeaveRule } from '#/lib/leave'
import { sendOrQueue } from '#/lib/sync/outbox'
import { toast } from '#/lib/toast'
import {
  answerRequestFn,
  concedeMatchFn,
  deleteCompetitionFn,
  handOverCompetitionFn,
  leaveCompetitionFn,
  newInviteCodeFn,
  removePlayerFn,
  renameCompetitionFn,
} from '#/server/competitions.functions'

export { LEAVE_HELP }

/** Leagues: the organiser's rule for a player who leaves after the start. */
export function LeaveRuleChoice({
  value,
  onChange,
}: {
  value: LeaveRule
  onChange: (rule: LeaveRule) => void
}) {
  return (
    <div className="space-y-1.5">
      <Choice
        label="If a player leaves after it starts"
        value={value}
        onChange={onChange}
        options={(Object.keys(LEAVE_LABEL) as LeaveRule[]).map((rule) => ({
          value: rule,
          label: LEAVE_LABEL[rule],
        }))}
      />
      <p className="text-xs text-muted-foreground">
        {LEAVE_HELP[value]} They can't rejoin once it has started.
      </p>
    </div>
  )
}

const EARLY_LABEL: Record<EarlyRounds, string> = {
  organiser: 'Let me decide',
  auto: 'Open the next round',
  wait: 'Wait for its date',
}

const EARLY_HELP: Record<EarlyRounds, string> = {
  organiser:
    'When everyone has played, you get a button to open the next round.',
  auto: 'The next round opens by itself as soon as everyone has played.',
  wait: 'Each round opens on its scheduled date.',
}

/** Leagues: what happens when every game of a round is in before its window ends. */
export function EarlyRoundsChoice({
  value,
  onChange,
}: {
  value: EarlyRounds
  onChange: (rule: EarlyRounds) => void
}) {
  return (
    <div className="space-y-1.5">
      <Choice
        label="When a round finishes early"
        value={value}
        onChange={onChange}
        options={(Object.keys(EARLY_LABEL) as EarlyRounds[]).map((rule) => ({
          value: rule,
          label: EARLY_LABEL[rule],
        }))}
      />
      <p className="text-xs text-muted-foreground">
        {EARLY_HELP[value]}
        {value !== 'wait' &&
          ' Players are told; deadlines stay the same, so playing early is optional.'}
      </p>
    </div>
  )
}

/** A confirm step for anything that can't be undone. */
function Confirm({
  trigger,
  title,
  description,
  confirmLabel,
  disabled,
  onConfirm,
  children,
}: {
  trigger: ReactNode
  title: string
  description: ReactNode
  confirmLabel: string
  disabled?: boolean
  onConfirm: () => Promise<unknown>
  children?: ReactNode
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={disabled}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const fail = (title: string) => (error: unknown) =>
  toast.error(title, { desc: (error as Error).message })

/** A member leaves; after the start, the organiser's rule settles their games. */
export function LeaveButton({
  slug,
  started,
  format,
  leaveRule,
}: {
  slug: string
  started: boolean
  format: 'league' | 'knockout' | 'challenge' | 'groups'
  leaveRule: LeaveRule
}) {
  const leave = useServerFn(leaveCompetitionFn)
  const router = useRouter()
  const consequence = !started
    ? "It hasn't started, so you can join again later."
    : format === 'knockout'
      ? "Your opponent goes through, and you can't rejoin."
      : `${LEAVE_HELP[leaveRule]} You can't rejoin.`
  return (
    <Confirm
      trigger={
        <Button variant="ghost" className="w-full text-destructive">
          Leave competition
        </Button>
      }
      title="Leave this competition?"
      description={consequence}
      confirmLabel="Leave"
      onConfirm={() =>
        leave({ data: { slug } })
          .then(() => router.invalidate())
          .then(() => toast.success('You left the competition'))
          .catch(fail("Couldn't leave"))
      }
    />
  )
}

/** A player who can't play gives their opponent the walkover. */
export function ConcedeButton({
  slug,
  matchId,
  opponent,
}: {
  slug: string
  matchId: string
  opponent: string
}) {
  const concede = useServerFn(concedeMatchFn)
  const router = useRouter()
  return (
    <Confirm
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
        >
          Can't play? Give walkover
        </Button>
      }
      title={`Give ${opponent} the walkover?`}
      description={`${opponent} gets the win for this match. You can't take it back; only the organiser can reopen it.`}
      confirmLabel="Give walkover"
      onConfirm={() =>
        sendOrQueue('concedeMatch', { slug, matchId }, () =>
          concede({ data: { slug, matchId } }),
        )
          .then(async (done) => {
            if (done === 'queued') return
            await router.invalidate()
            toast.success(`${opponent} has the walkover`)
          })
          .catch(fail("Couldn't give the walkover"))
      }
    />
  )
}

/** The organiser makes another member the organiser. */
export function HandOver({
  slug,
  members,
}: {
  slug: string
  members: Array<{ id: string; name: string }>
}) {
  const handOver = useServerFn(handOverCompetitionFn)
  const router = useRouter()
  const [to, setTo] = useState('')
  const chosen = members.find((m) => m.id === to)
  if (members.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Hand it over</p>
      <div className="flex gap-2">
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger aria-label="New organiser" className="flex-1">
            <SelectValue placeholder="Choose a player" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Confirm
          trigger={
            <Button variant="secondary" disabled={!chosen}>
              Hand over
            </Button>
          }
          title={`Make ${chosen?.name ?? 'them'} the organiser?`}
          description="They get every organiser power and you become a regular player. Only they can hand it back."
          confirmLabel="Hand over"
          onConfirm={() =>
            handOver({ data: { slug, toUserId: to } })
              .then(() => router.invalidate())
              .then(() => toast.success(`${chosen?.name} runs it now`))
              .catch(fail("Couldn't hand it over"))
          }
        />
      </div>
    </div>
  )
}

/** Deletes it for everyone, after typing its name. */
export function DeleteCompetition({
  slug,
  name,
}: {
  slug: string
  name: string
}) {
  const remove = useServerFn(deleteCompetitionFn)
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase()
  return (
    <Confirm
      trigger={
        <Button variant="ghost" className="w-full text-destructive">
          Delete competition
        </Button>
      }
      title={`Delete ${name}?`}
      description="Every fixture, result and player list goes, for everyone. This can't be undone."
      confirmLabel="Delete"
      disabled={!matches}
      onConfirm={() =>
        remove({ data: { slug, confirmName: typed } })
          .then(() => navigate({ to: '/' }))
          .then(() => toast.success(`${name} was deleted`))
          .catch(fail("Couldn't delete it"))
      }
    >
      <Input
        aria-label="Type the competition name"
        placeholder={name}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />
    </Confirm>
  )
}

/** The organiser renames it; the link stays the same. */
export function RenameCompetition({
  slug,
  name,
}: {
  slug: string
  name: string
}) {
  const rename = useServerFn(renameCompetitionFn)
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const changed = value.trim() !== name && value.trim().length > 0
  return (
    <form
      className="space-y-1.5"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!changed) return
        setBusy(true)
        try {
          await rename({ data: { slug, name: value } })
          await router.invalidate()
          toast.success('Renamed')
        } catch (error) {
          fail("Couldn't rename it")(error)
        } finally {
          setBusy(false)
        }
      }}
    >
      <label htmlFor="rename" className="text-sm font-medium">
        Name
      </label>
      <div className="flex gap-2">
        <Input
          id="rename"
          maxLength={60}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!changed || busy}>
          Save
        </Button>
      </div>
    </form>
  )
}

/** Most players it takes; empty means no limit. Saved when the field is left. */
export function MaxPlayersField({
  value,
  onSave,
}: {
  value: number | null
  onSave: (maxPlayers: number | null) => void
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  return (
    <div className="space-y-1.5">
      <label htmlFor="max-players" className="text-sm font-medium">
        Most players
      </label>
      <Input
        id="max-players"
        type="number"
        inputMode="numeric"
        min={2}
        max={256}
        placeholder="No limit"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next =
            draft.trim() === ''
              ? null
              : Math.min(256, Math.max(2, Math.round(Number(draft))))
          if (next !== null && Number.isNaN(next)) return setDraft('')
          setDraft(next === null ? '' : String(next))
          if (next !== value) onSave(next)
        }}
      />
      <p className="text-xs text-muted-foreground">
        Leave it empty for no limit. Once full, nobody else can join.
      </p>
    </div>
  )
}

/** A fresh invite code; links with the old one stop working. */
export function NewInviteCode({ slug }: { slug: string }) {
  const renew = useServerFn(newInviteCodeFn)
  const router = useRouter()
  return (
    <Confirm
      trigger={
        <Button variant="ghost" size="sm">
          New code
        </Button>
      }
      title="Make a new invite code?"
      description="The old code and every link with it stop working. Share the new one with anyone still to join."
      confirmLabel="Make new code"
      onConfirm={() =>
        renew({ data: { slug } })
          .then(() => router.invalidate())
          .then(() => toast.success('New invite code ready'))
          .catch(fail("Couldn't make a new code"))
      }
    />
  )
}

/** The organiser takes a player out, under the same rules as leaving. */
export function RemovePlayer({
  slug,
  userId,
  name,
  started,
  format,
  leaveRule,
}: {
  slug: string
  userId: string
  name: string
  started: boolean
  format: 'league' | 'knockout' | 'challenge' | 'groups'
  leaveRule: LeaveRule
}) {
  const remove = useServerFn(removePlayerFn)
  const router = useRouter()
  const consequence = !started
    ? `${name} can join again later.`
    : format === 'knockout'
      ? `Their opponent goes through, and ${name} can't rejoin.`
      : `${LEAVE_HELP[leaveRule]} ${name} can't rejoin.`
  return (
    <Confirm
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive">
          Remove
        </Button>
      }
      title={`Remove ${name}?`}
      description={consequence}
      confirmLabel="Remove"
      onConfirm={() =>
        remove({ data: { slug, userId } })
          .then(() => router.invalidate())
          .then(() => toast.success(`${name} was removed`))
          .catch(fail("Couldn't remove them"))
      }
    />
  )
}

/** Who asked to join, with the organiser's yes or no for each. */
export function JoinRequests({
  slug,
  requests,
}: {
  slug: string
  requests: Array<{ id: string; name: string; image: string | null }>
}) {
  const answer = useServerFn(answerRequestFn)
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  if (requests.length === 0) return null

  async function reply(userId: string, name: string, approve: boolean) {
    setBusy(userId)
    try {
      const data = { slug, userId, approve }
      const done = await sendOrQueue('answerRequest', data, () =>
        answer({ data }),
      )
      if (done === 'queued') return
      await router.invalidate()
      toast.success(approve ? `${name} is in` : `Declined ${name}`)
    } catch (error) {
      fail("Couldn't answer that")(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Asking to join ({requests.length})</p>
      {requests.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2"
        >
          <span className="min-w-0 truncate text-sm font-medium">{r.name}</span>
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === r.id}
              onClick={() => reply(r.id, r.name, false)}
            >
              Decline
            </Button>
            <Button
              size="sm"
              disabled={busy === r.id}
              onClick={() => reply(r.id, r.name, true)}
            >
              Approve
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
