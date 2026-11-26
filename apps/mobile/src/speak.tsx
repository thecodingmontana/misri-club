import * as Speech from 'expo-speech'
import { Button, useThemeColor } from 'heroui-native'
import { useEffect, useState } from 'react'
import { Icon } from '@/icon'

/** Reads a block of text aloud with the phone's speech engine, as on the website. */
export function SpeakButton({ text }: { text: string }) {
  const accent = useThemeColor('accent')
  const [speaking, setSpeaking] = useState(false)
  // leaving the page stops whatever is being read
  useEffect(() => () => void Speech.stop(), [])
  const toggle = () => {
    void Speech.stop()
    if (speaking) return setSpeaking(false)
    const done = () => setSpeaking(false)
    Speech.speak(text, { onDone: done, onStopped: done, onError: done })
    setSpeaking(true)
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      isIconOnly
      onPress={toggle}
      accessibilityLabel={speaking ? 'Stop reading' : 'Read aloud'}
      accessibilityState={{ selected: speaking }}
    >
      <Icon name={speaking ? 'Pause' : 'Volume'} size={16} color={accent} />
    </Button>
  )
}
