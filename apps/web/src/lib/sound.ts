import { useRouter } from '@tanstack/react-router'
import { bind, play, setEnabled } from 'cuelume'
import { useEffect } from 'react'

/**
 * Interface sounds, synthesized in the browser by cuelume. Elements opt in
 * with `data-cuelume-*` attributes (the shared Button taps); outcomes are
 * played from code. On unless this browser turned them off.
 */

const KEY = 'misri:sound'

export function storedSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveSoundOn(on: boolean) {
  setEnabled(on)
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
}

/** Wires up every marked element, and a whoosh on each page change. */
export function useInterfaceSounds() {
  const router = useRouter()

  useEffect(() => {
    setEnabled(storedSoundOn())
    const unbind = bind()
    const unsubscribe = router.subscribe('onResolved', (event) => {
      if (event.pathChanged) play('navigate')
    })
    return () => {
      unbind()
      unsubscribe()
    }
  }, [router])
}
