import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Spinner } from '#/components/auth'
import { Choice } from '#/components/competitions'
import { displayName } from '#/components/match-card'
import { Button } from '#/components/ui/button'
import { sendOrQueue, useWaiting } from '#/lib/sync/outbox'
import { QUEUED_LABEL, type Queueable } from '#/lib/sync/queueable'
import { toast } from '#/lib/toast'
import type { MatchView } from '#/server/competition-view.server'
import { answerReportFn, reportResultFn } from '#/server/competitions.functions'

/**
 * For a game chess.com won't show us (over the board, another site): one
 * player reports it, the other confirms it, and it counts. A dispute goes to
 * the organiser, who can always enter the result themselves.
 */
export function MatchReport({
  slug,
  match,
  viewerId,
  primary = false,
}: {
  slug: string
  match: MatchView
  viewerId: string | null
  /** results come only from reports here, so reporting is the main action */
  primary?: boolean
}) {
  const waiting = useWaiting(match.id)
  const { home, away, report } = match
  if (!home || !away) return null
  if (waiting) return <WaitingNote name={waiting} />
  if (match.status !== 'live' && match.status !== 'expired') return null
  const isPlayer = viewerId === home.id || viewerId === away.id

  if (report) {
    const winner =
      report.result === 'draw'
        ? null
        : (report.result === 'white') === report.homeWhite
          ? home
          : away
    const by = report.byUserId === home.id ? home : away
    const other = by === home ? away : home
    const said = `${displayName(by)} says ${
      !winner
        ? 'it was a draw'
        : winner === by
          ? 'they won'
          : `${displayName(winner)} won`
    }.`
    return (
      <div className="mt-2 space-y-2 rounded-xl bg-secondary/60 px-3 py-2 text-center text-xs">
        <p>
          {said}{' '}
          {viewerId === other.id
            ? 'Is that right?'
            : `Waiting for ${displayName(other)} to confirm.`}
        </p>
        {viewerId === other.id && (
          <Answer slug={slug} matchId={match.id} seen={report} />
        )}
      </div>
    )
  }

  return isPlayer ? (
    <ReportForm slug={slug} matchId={match.id} primary={primary} />
  ) : null
}

/** Saved offline on this device, not sent yet. */
export function WaitingNote({ name }: { name: Queueable }) {
  return (
    <p
      role="status"
      className="mt-2 rounded-xl bg-secondary/60 px-3 py-2 text-center text-xs text-muted-foreground"
    >
      {QUEUED_LABEL[name]} is waiting to send. It goes as soon as you're back
      online.
    </p>
  )
}

function Answer({
  slug,
  matchId,
  seen,
}: {
  slug: string
  matchId: string
  seen: { result: 'white' | 'black' | 'draw'; homeWhite: boolean }
}) {
  const answer = useServerFn(answerReportFn)
  const router = useRouter()
  const [busy, setBusy] = useState<boolean | null>(null)
  const send = async (accept: boolean) => {
    setBusy(accept)
    try {
      const data = {
        slug,
        matchId,
        accept,
        seen: { result: seen.result, homeWhite: seen.homeWhite },
      }
      const done = await sendOrQueue('answerReport', data, () =>
        answer({ data }),
      )
      if (done === 'queued') return
      await router.invalidate()
      toast.success(
        accept
          ? 'Confirmed. The result counts.'
          : 'Disputed. The organiser will settle it.',
      )
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        className="flex-1"
        disabled={busy !== null}
        onClick={() => send(true)}
      >
        {busy === true && <Spinner />}
        Confirm
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="flex-1"
        disabled={busy !== null}
        onClick={() => send(false)}
      >
        {busy === false && <Spinner />}
        Dispute
      </Button>
    </div>
  )
}

function ReportForm({
  slug,
  matchId,
  primary,
}: {
  slug: string
  matchId: string
  primary: boolean
}) {
  const report = useServerFn(reportResultFn)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<'win' | 'draw' | 'loss'>('win')
  const [white, setWhite] = useState(true)
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <Button
        variant={primary ? 'secondary' : 'ghost'}
        size="sm"
        className={primary ? 'mt-2 w-full' : 'w-full text-muted-foreground'}
        onClick={() => setOpen(true)}
      >
        {primary
          ? 'Report the result'
          : 'Played somewhere else? Report the result'}
      </Button>
    )
  }

  return (
    <form
      className="mt-2 space-y-3 rounded-xl bg-secondary/60 p-3"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        try {
          const data = { slug, matchId, outcome, white }
          const done = await sendOrQueue('reportResult', data, () =>
            report({ data }),
          )
          if (done === 'queued') return setOpen(false)
          await router.invalidate()
          toast.success('Reported. It counts once your opponent confirms.')
        } catch (error) {
          toast.error((error as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Choice
        label="How did it go?"
        value={outcome}
        onChange={setOutcome}
        options={[
          { value: 'win', label: 'I won' },
          { value: 'draw', label: 'Draw' },
          { value: 'loss', label: 'I lost' },
        ]}
      />
      <Choice
        label="You played"
        value={white ? 'white' : 'black'}
        onChange={(value) => setWhite(value === 'white')}
        options={[
          { value: 'white', label: 'White' },
          { value: 'black', label: 'Black' },
        ]}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1" disabled={busy}>
          {busy && <Spinner />}
          Report
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
