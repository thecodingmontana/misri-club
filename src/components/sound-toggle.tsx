import { useEffect, useState } from 'react'
import { Volume, VolumeOff } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { saveSoundOn, storedSoundOn } from '#/lib/sound'

/** Sound on or off for this browser; the server render assumes on. */
export function SoundToggle() {
  const [on, setOn] = useState(true)
  useEffect(() => setOn(storedSoundOn()), [])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full"
      aria-label="Interface sounds"
      aria-pressed={on}
      data-cuelume-tap="toggle"
      onClick={() => {
        saveSoundOn(!on)
        setOn(!on)
      }}
    >
      {on ? (
        <Volume className="size-[1.15rem]" />
      ) : (
        <VolumeOff className="size-[1.15rem]" />
      )}
    </Button>
  )
}
