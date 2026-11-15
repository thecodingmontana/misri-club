import {
  type RefObject,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'

// Motion for the landing page: JS loops run only while on screen, never under
// reduced motion, and stop when the visitor pauses animations (WCAG 2.2.2).

const KEY = 'misri-motion'

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-motion'],
  })
  const query = matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', onChange)
  return () => {
    observer.disconnect()
    query.removeEventListener('change', onChange)
  }
}

const stopped = () =>
  document.documentElement.dataset.motion === 'paused' ||
  matchMedia('(prefers-reduced-motion: reduce)').matches

/** True when motion should stop: paused by the visitor or reduced motion. */
export function useMotionStopped() {
  return useSyncExternalStore(subscribe, stopped, () => false)
}

/** Restores the visitor's pause choice; returns a setter for the switch. */
export function usePauseSwitch() {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    let saved = false
    try {
      saved = localStorage.getItem(KEY) === 'paused'
    } catch {}
    setPaused(saved)
  }, [])
  useEffect(() => {
    if (paused) document.documentElement.dataset.motion = 'paused'
    else delete document.documentElement.dataset.motion
    try {
      localStorage.setItem(KEY, paused ? 'paused' : 'on')
    } catch {}
  }, [paused])
  return [paused, setPaused] as const
}

/** Whether the element is on screen (loops sleep when it isn't). */
export function useInView(ref: RefObject<Element | null>) {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry.isIntersecting),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return inView
}

/** Calls `tick` every `ms` while running is true. */
export function useLoop(running: boolean, ms: number, tick: () => void) {
  useEffect(() => {
    if (!running) return
    const id = setInterval(tick, ms)
    return () => clearInterval(id)
  }, [running, ms, tick])
}
