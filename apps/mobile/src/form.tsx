import {
  Checkbox,
  ControlField,
  Description,
  Input,
  Label,
  Radio,
  RadioGroup,
  Tabs,
  TextField,
} from 'heroui-native'
import { type ReactNode, useState } from 'react'
import { Text, View } from 'react-native'
import { play } from '@/lib/sound'

// what still fits one row on a phone: a few short options, equal widths
const fitsOneRow = (options: Array<{ label: string }>) =>
  options.length <= 3 && options.reduce((n, o) => n + o.label.length, 0) <= 24

/**
 * The website's Choice: one exclusive option. A few short ones sit as one row
 * of equal segments; anything longer is a list of radio buttons, so no label
 * is ever cut off or scrolled out of sight.
 */
export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  help?: ReactNode
}) {
  const pick = (next: string) => {
    const picked = options.find((o) => String(o.value) === next)
    if (picked) {
      play('select')
      onChange(picked.value)
    }
  }
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      {fitsOneRow(options) ? (
        <Tabs value={String(value)} onValueChange={pick}>
          <Tabs.List className="w-full">
            <Tabs.Indicator />
            {options.map((option) => (
              <Tabs.Trigger
                key={String(option.value)}
                value={String(option.value)}
                className="flex-1"
              >
                <Tabs.Label numberOfLines={1}>{option.label}</Tabs.Label>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>
      ) : (
        <RadioGroup value={String(value)} onValueChange={pick}>
          {options.map((option) => (
            <RadioGroup.Item
              key={String(option.value)}
              value={String(option.value)}
            >
              <Text className="flex-1 font-normal text-sm text-foreground">
                {option.label}
              </Text>
              <Radio />
            </RadioGroup.Item>
          ))}
        </RadioGroup>
      )}
      {help && <Hint>{help}</Hint>}
    </View>
  )
}

/** Small muted help under a field. */
export function Hint({ children }: { children: ReactNode }) {
  return <Text className="font-normal text-xs text-muted">{children}</Text>
}

/** A labelled checkbox with its explanation underneath. */
export function CheckField({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <ControlField
      isSelected={value}
      onSelectedChange={(next) => {
        play('select')
        onChange(next)
      }}
    >
      <ControlField.Indicator>
        <Checkbox className="mt-0.5" />
      </ControlField.Indicator>
      <View className="flex-1">
        <Label>{label}</Label>
        <Description>{description}</Description>
      </View>
    </ControlField>
  )
}

/**
 * A whole number typed in, clamped to [min, max] when the field is left;
 * empty means null when `optional`.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  help,
  optional,
  compact,
  live,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  min: number
  max: number
  placeholder?: string
  help?: ReactNode
  optional?: boolean
  compact?: boolean
  /** report each valid number as it's typed (a form that submits later) */
  live?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    setDraft(null)
    if (draft.trim() === '') return optional ? onChange(null) : undefined
    const n = Number(draft)
    if (Number.isFinite(n))
      onChange(Math.min(max, Math.max(min, Math.round(n))))
  }
  return (
    <TextField className={compact ? 'flex-1' : undefined}>
      <Label className={compact ? 'text-xs text-muted' : undefined}>
        {label}
      </Label>
      <Input
        // digits only; a minus key only where the number can go below zero
        keyboardType={min < 0 ? 'numeric' : 'number-pad'}
        value={draft ?? (value === null ? '' : String(value))}
        placeholder={placeholder}
        onChangeText={(text) => {
          setDraft(text)
          const n = Number(text)
          // what Create saves is what blur would show: rounded into range
          if (live && text.trim() && Number.isFinite(n)) {
            onChange(Math.min(max, Math.max(min, Math.round(n))))
          }
          if (live && optional && text.trim() === '') onChange(null)
        }}
        onBlur={commit}
        onSubmitEditing={commit}
        className={compact ? 'text-center' : undefined}
      />
      {help && <Description>{help}</Description>}
    </TextField>
  )
}
