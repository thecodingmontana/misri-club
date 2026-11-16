import { ChevronDown, ChevronUp } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import type { TieBreak } from '#/server/standings'

/** "YYYY-MM-DD" of a stored start, for the date input. */
export const startDayOf = (startsAt: number | null) =>
  startsAt ? new Date(startsAt).toISOString().slice(0, 10) : null

/** Optional start day: the morning run starts it if the organiser hasn't. */
export function StartDateField({
  value,
  disabled,
  onChange,
}: {
  value: string | null
  disabled?: boolean
  onChange: (day: string | null) => void
}) {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  return (
    <div className="space-y-1.5">
      <label htmlFor="starts-on" className="text-sm font-medium">
        Start date (optional)
      </label>
      <div className="flex gap-2">
        <Input
          id="starts-on"
          type="date"
          min={tomorrow}
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || null)}
        />
        {value && (
          <Button
            variant="ghost"
            className="rounded-full"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            Clear
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        It starts that morning (08:00 Nairobi) if you haven't started it.
        Everyone is told.
      </p>
    </div>
  )
}

const TIE_LABEL: Record<TieBreak, string> = {
  wins: 'More wins',
  forfeits: 'Fewer forfeits',
  headToHead: 'Head-to-head',
}

/** Leagues: the order ties on points are broken in; name decides last. */
export function TieBreakOrder({
  value,
  disabled,
  onChange,
}: {
  value: TieBreak[]
  disabled?: boolean
  onChange: (order: TieBreak[]) => void
}) {
  const move = (from: number, to: number) => {
    const order = [...value]
    ;[order[from], order[to]] = [order[to], order[from]]
    onChange(order)
  }
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Level on points</p>
      <ol className="divide-y divide-border rounded-xl bg-secondary/40">
        {value.map((key, i) => (
          <li key={key} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="numeric w-5 text-xs font-bold text-muted-foreground">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 text-sm">{TIE_LABEL[key]}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-full"
              aria-label={`Move ${TIE_LABEL[key]} up`}
              data-tip="Move up"
              disabled={disabled || i === 0}
              onClick={() => move(i, i - 1)}
            >
              <ChevronUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-full"
              aria-label={`Move ${TIE_LABEL[key]} down`}
              data-tip="Move down"
              disabled={disabled || i === value.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <ChevronDown aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Head-to-head is the points they took off each other. Still level: by
        name.
      </p>
    </div>
  )
}
