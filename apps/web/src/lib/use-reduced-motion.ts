import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** True when the visitor asked for less motion; false on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = matchMedia(QUERY)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => matchMedia(QUERY).matches,
    () => false,
  )
}
