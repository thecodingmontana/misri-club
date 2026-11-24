import {
  POINT_KEYS,
  POINT_LABEL,
  scoringSummary,
  UNPLAYED_HELP,
  UNPLAYED_LABEL,
} from '@misri/core/formats'
import { useId, useState } from 'react'
import { Choice } from '#/components/competitions'
import { Input } from '#/components/ui/input'
import type { Points, UnplayedRule } from '#/server/standings'

export { scoringSummary }

export interface Scoring {
  unplayedRule: UnplayedRule
  points: Points
}

/**
 * The organiser's scoring choices. Leagues pick a rule for unplayed matches
 * and the points; a tournament needs someone to go through, so the organiser
 * always decides there.
 */
export function ScoringRules({
  format,
  unplayedRule,
  points,
  disabled,
  onChange,
}: Scoring & {
  format: 'league' | 'knockout' | 'challenge' | 'groups'
  disabled?: boolean
  onChange: (next: Scoring) => void
}) {
  const id = useId()
  // typed values stay local until the field is left, so each key isn't a save
  const [draft, setDraft] = useState<Partial<Record<keyof Points, string>>>({})

  if (format !== 'league') {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium">Unplayed matches</p>
        <p className="text-xs text-muted-foreground">
          You decide each one: award a walkover to whoever turned up. Someone
          has to go through.
        </p>
      </div>
    )
  }

  function commit(key: keyof Points) {
    const typed = draft[key]
    setDraft(({ [key]: _, ...rest }) => rest)
    if (typed === undefined || !Number.isInteger(Number(typed))) return
    const value = Math.min(10, Math.max(-10, Number(typed)))
    if (value !== points[key]) {
      onChange({ unplayedRule, points: { ...points, [key]: value } })
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Choice
          label="When a match isn't played in time"
          value={unplayedRule}
          onChange={(rule) =>
            !disabled && onChange({ unplayedRule: rule, points })
          }
          options={(Object.keys(UNPLAYED_LABEL) as Array<UnplayedRule>).map(
            (value) => ({ value, label: UNPLAYED_LABEL[value] }),
          )}
        />
        <p className="text-xs text-muted-foreground">
          {UNPLAYED_HELP[unplayedRule]} You can award a walkover yourself at any
          time.
        </p>
      </div>

      <fieldset className="space-y-1.5" disabled={disabled}>
        <legend className="text-sm font-medium">Points</legend>
        <div className="grid grid-cols-4 gap-2">
          {POINT_KEYS.map((key) => (
            <div key={key} className="space-y-1 text-xs text-muted-foreground">
              <label htmlFor={`${id}-${key}`} className="block">
                {POINT_LABEL[key]}
              </label>
              <Input
                id={`${id}-${key}`}
                type="number"
                inputMode="numeric"
                min={-10}
                max={10}
                className="numeric text-center"
                value={draft[key] ?? String(points[key])}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
                onBlur={() => commit(key)}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          A walkover counts as a win for one and a forfeit for the other.
        </p>
      </fieldset>
    </div>
  )
}
