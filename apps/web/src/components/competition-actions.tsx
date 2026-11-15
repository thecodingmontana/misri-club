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
import type { LeaveRule } from '#/lib/leave'
import { toast } from '#/lib/toast'
import {
  deleteCompetitionFn,
  handOverCompetitionFn,
  leaveCompetitionFn,
} from '#/server/competitions.functions'

const LEAVE_LABEL: Record<LeaveRule, string> = {
  award: 'Award their games',
  void: 'Wipe their games',
  keep: 'Keep results',
}

/** What leaving does, in the words the leaver and organiser both read. */
export const LEAVE_HELP: Record<LeaveRule, string> = {
  award:
    'Their unplayed games go to the opponents as wins; they take the forfeits and drop off the table.',
  void: 'All their games are removed, played ones too, as if they never entered.',
  keep: 'Games already played still count; the rest are called off.',
}

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
  format: 'league' | 'knockout'
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
