import {
  Checkbox,
  ControlField,
  Description,
  Input,
  Label,
  Tabs,
  TextField,
} from 'heroui-native'
import { type ReactNode, useState } from 'react'
import { Text, View } from 'react-native'

/** The website's Choice: two to five exclusive options as one row (HeroUI Tabs). */
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
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      <Tabs
        value={String(value)}
        onValueChange={(next) => {
          const picked = options.find((o) => String(o.value) === next)
          if (picked) onChange(picked.value)
        }}
      >
        <Tabs.List>
          <Tabs.ScrollView scrollAlign="start">
            <Tabs.Indicator />
            {options.map((option) => (
              <Tabs.Trigger
                key={String(option.value)}
                value={String(option.value)}
              >
                <Tabs.Label>{option.label}</Tabs.Label>
              </Tabs.Trigger>
            ))}
          </Tabs.ScrollView>
        </Tabs.List>
      </Tabs>
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
    <ControlField isSelected={value} onSelectedChange={onChange}>
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
        keyboardType="numbers-and-punctuation"
        value={draft ?? (value === null ? '' : String(value))}
        placeholder={placeholder}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        className={compact ? 'text-center' : undefined}
      />
      {help && <Description>{help}</Description>}
    </TextField>
  )
}
