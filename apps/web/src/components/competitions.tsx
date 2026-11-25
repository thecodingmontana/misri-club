import {
  CREATE_CHOICES,
  FORMAT_INFO,
  FORMAT_LABEL,
  STATUS_LABEL,
} from '@misri/core/formats'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Spinner } from '#/components/auth'
import { ChevronRight, Trophy, UserPlus, UsersFilled } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { timeControlLabel } from '#/lib/time-control'
import { toast } from '#/lib/toast'
import { cn } from '#/lib/utils'
import type { CompetitionSummary } from '#/server/competition-view.server'
import { joinCompetitionFn } from '#/server/competitions.functions'

export { FORMAT_INFO, FORMAT_LABEL, STATUS_LABEL }

/** "How a league works": the format's rules, folded unless `open`. */
export function FormatExplainer({
  format,
  open,
}: {
  format: keyof typeof FORMAT_INFO
  open?: boolean
}) {
  return (
    <details
      open={open}
      className="group rounded-2xl bg-card px-4 py-3 text-sm shadow-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium [&::-webkit-details-marker]:hidden">
        How a {FORMAT_LABEL[format].toLowerCase()} works
        <ChevronRight className="size-4 text-muted-foreground transition-[rotate] duration-150 group-open:rotate-90" />
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        {FORMAT_INFO[format].points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </details>
  )
}
/** One competition in a list: name, format, players and where it stands. */
export function CompetitionCard({
  competition,
  action,
}: {
  competition: CompetitionSummary
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3.5 shadow-card">
      <Link
        to="/c/$slug"
        params={{ slug: competition.slug }}
        className="group flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
          <Trophy className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold transition-colors group-hover:text-primary">
            {competition.name}
          </span>
          <span className="numeric flex items-center gap-1.5 text-xs text-muted-foreground">
            {FORMAT_LABEL[competition.format]}
            {competition.timeControl !== 'any' && (
              <>
                <span aria-hidden>·</span>
                {timeControlLabel(competition.timeControl)}
              </>
            )}
            <span aria-hidden>·</span>
            <UsersFilled className="size-3.5" aria-hidden />
            {competition.members}
            <span aria-hidden>·</span>
            {STATUS_LABEL[competition.status]}
          </span>
        </span>
        {!action && (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
      </Link>
      {action}
    </div>
  )
}

/** Join a public competition in one press, then open it. */
export function JoinButton({
  slug,
  code,
  label = 'Join',
  size = 'sm',
}: {
  slug?: string
  code?: string
  label?: string
  size?: 'sm' | 'lg'
}) {
  const join = useServerFn(joinCompetitionFn)
  const navigate = useNavigate()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onJoin() {
    setBusy(true)
    try {
      const result = await join({
        data: code ? { code } : { slug: slug ?? '' },
      })
      if (result.pending) toast.success('Request sent to the organiser')
      await navigate({ to: '/c/$slug', params: { slug: result.slug } })
      // the page may already be this one: show the new state
      await router.invalidate()
      setBusy(false)
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(false)
    }
  }

  return (
    <Button
      size={size}
      className={size === 'lg' ? 'w-full rounded-xl' : 'rounded-full'}
      onClick={onJoin}
      disabled={busy}
    >
      {busy ? <Spinner /> : <UserPlus />}
      {label}
    </Button>
  )
}

/** Public competitions you could join right now. */
export function OpenCompetitions({
  competitions,
}: {
  competitions: Array<CompetitionSummary>
}) {
  return (
    <section className="space-y-3" aria-labelledby="open-heading">
      <div className="flex items-center justify-between">
        <h2 id="open-heading" className="kicker">
          Open competitions
        </h2>
        <Link
          to="/discover"
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          See all
        </Link>
      </div>
      {competitions.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
          No public competitions are taking players right now.
        </p>
      ) : (
        competitions.map((competition) => (
          <CompetitionCard
            key={competition.slug}
            competition={competition}
            action={<JoinButton slug={competition.slug} />}
          />
        ))
      )}
    </section>
  )
}

/** Every way to start a competition, for the start page and home. */
export const CHOICES = CREATE_CHOICES.map((choice) => ({
  ...choice,
  to: '/competitions/new' as const,
  search: { format: choice.format },
}))

/** Create a league, create a tournament, or join with a code. */
export function StartChoices() {
  const itemClass =
    'flex items-center gap-4 rounded-2xl bg-card px-4 py-4 shadow-card transition-colors duration-150 hover:bg-secondary'
  return (
    <nav className="space-y-3" aria-label="Start">
      {CHOICES.map((choice) => (
        <Link
          key={choice.title}
          to={choice.to}
          search={choice.search}
          className={itemClass}
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Trophy className="size-6" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{choice.title}</span>
            <span className="block text-xs text-muted-foreground">
              {choice.description}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
      <Link to="/join" className={itemClass}>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
          <UserPlus className="size-6" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Join with a code</span>
          <span className="block text-xs text-muted-foreground">
            Got an invite code from a friend? Enter it here.
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </nav>
  )
}

/** Two or three mutually exclusive options as a row of pills. */
export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors duration-150',
              value === option.value
                ? 'border-primary bg-primary/12 text-primary'
                : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
