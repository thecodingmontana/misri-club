import { useEffect, useState } from 'react'
import { Pause, Volume } from '#/components/icons'
import { Button } from '#/components/ui/button'

/** Reads a block of text aloud with the browser's own speech engine. */
export function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)

  // Leaving the page stops whatever is being read.
  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  const toggle = () => {
    const synth = window.speechSynthesis
    if (!synth) return
    if (speaking) {
      synth.cancel()
      setSpeaking(false)
      return
    }
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    synth.speak(utterance)
    setSpeaking(true)
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      className="shrink-0 rounded-full"
      onClick={toggle}
      aria-label={speaking ? 'Stop reading' : 'Read aloud'}
      aria-pressed={speaking}
    >
      {speaking ? <Pause /> : <Volume />}
    </Button>
  )
}
