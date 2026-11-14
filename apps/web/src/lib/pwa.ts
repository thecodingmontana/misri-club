import { useSyncExternalStore } from 'react'
import { toast } from '#/lib/toast'

// The installable app: the service worker (push), the browser's install
// offer, and telling an open tab when a newer version went live.

type InstallEvent = Event & { prompt: () => Promise<unknown> }
let offer: InstallEvent | null = null
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}

const VERSION_CHECK_MS = 5 * 60 * 1000
let started = false
let updateShown = false

/** Registers the service worker, keeps the install offer, watches for deploys. */
export function startPwa() {
  if (typeof window === 'undefined' || started) return
  started = true
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .catch(() => {})
  }
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    offer = event as InstallEvent
    emit()
  })
  addEventListener('appinstalled', () => {
    offer = null
    emit()
  })
  // An old tab whose code chunks were replaced by a deploy: say so.
  addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    announceUpdate()
  })
  if (__BUILD_ID__ === 'dev') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkVersion()
  })
  setInterval(() => void checkVersion(), VERSION_CHECK_MS)
}

async function checkVersion() {
  if (updateShown) return
  try {
    const response = await fetch('/api/version', { cache: 'no-store' })
    const { id } = (await response.json()) as { id?: string }
    if (id && id !== 'dev' && id !== __BUILD_ID__) announceUpdate()
  } catch {
    // offline or mid-deploy: try again next time
  }
}

/** One sticky notice; the player reloads when it suits them (never mid-move). */
function announceUpdate() {
  if (updateShown) return
  updateShown = true
  toast.info('A new version of Misri is ready', {
    desc: 'Reload to get the latest.',
    duration: 0,
    action: { label: 'Reload', onClick: () => location.reload() },
  })
}

/** Running as the installed app (home screen / dock), not in a browser tab. */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone/iPad Safari: no install offer, so people add it from Share. */
export function isIosSafari() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

/** The install action while the browser offers one, otherwise null. */
export function useInstall() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => offer,
    () => null,
  )
  return current
    ? async () => {
        await current.prompt()
        offer = null
        emit()
      }
    : null
}
