import { Choice } from '#/components/competitions'
import {
  clockLabel,
  PRESETS,
  SPEEDS,
  type Speed,
  speedLabel,
  speedOf,
} from '#/lib/time-control'

/** Pick the competition's time control: any, a speed, then optionally an exact clock. */
export function TimeControlChoice({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const speed = speedOf(value)
  return (
    <div className="space-y-3">
      <Choice<'any' | Speed>
        label="Time control"
        value={speed ?? 'any'}
        onChange={onChange}
        options={[
          { value: 'any', label: 'Any' },
          ...SPEEDS.map((s) => ({ value: s, label: speedLabel(s) })),
        ]}
      />
      {speed && (
        <Choice
          label="Clock"
          value={value}
          onChange={onChange}
          options={[
            { value: speed, label: 'Any' },
            ...PRESETS[speed].map((preset) => ({
              value: preset,
              label: clockLabel(preset).replace(' per move', ''),
            })),
          ]}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Only chess.com games played at this time control count as results.
      </p>
    </div>
  )
}
