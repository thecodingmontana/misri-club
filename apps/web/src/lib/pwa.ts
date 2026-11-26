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

const VERSION_CHECK_MS = 2 * 60 * 1000
let started = false
let updateShown = false

/** Registers the service worker, keeps the install offer, watches for deploys. */
export function startPwa() {
  if (typeof window === 'undefined' || started) return
  started = true
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // the files this page loaded before the worker took over: keep them
        // too, so the very first visit already works offline next time
        const urls = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => name.startsWith(location.origin))
        registration.active?.postMessage({ type: 'keep-files', urls })
        registration.active?.postMessage({
          type: 'keep-page',
          url: location.href,
        })
      })
      .catch(() => {})
  }
  addEventListener('offline', () =>
    toast.info("You're offline", {
      desc: 'Pages you opened still show their last copy; changes need a connection.',
    }),
  )
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
  // Phones restore an installed app from memory without always firing
  // visibilitychange, so listen to every "you're back" signal there is.
  const onReturn = () => {
    if (document.visibilityState === 'visible') void checkVersion(true)
  }
  document.addEventListener('visibilitychange', onReturn)
  addEventListener('pageshow', onReturn)
  addEventListener('focus', onReturn)
  addEventListener('online', onReturn)
  void checkVersion(true)
  setInterval(() => void checkVersion(false), VERSION_CHECK_MS)
}

// What Train needs offline, fetched once per deploy: the pages (and the
// openings list, kept like a page), and the engine.
const OFFLINE_PAGES = [
  '/train',
  '/train/puzzles',
  '/train/play',
  '/train/progress',
  '/train/brilliant',
  '/train/masters',
  '/train/openings',
  // one of each: every game and course shares its page's code
  '/train/masters/anderssen-kieseritzky-1851',
  '/train/openings/italian-game',
  '/analysis',
  '/openings.tsv',
]
const OFFLINE_FILES = [
  '/stockfish/stockfish-19-lite-single.js',
  '/stockfish/stockfish-19-lite-single.wasm',
]
const WARMED = 'misri-offline-ready'

/**
 * Gets Train ready to use offline: in the installed app, or once someone opens
 * Train; skipped on data saver. `preload` loads a page's code.
 */
export function warmOffline(preload: (path: string) => Promise<unknown>) {
  const sw = navigator.serviceWorker?.controller
  const saveData = (navigator as { connection?: { saveData?: boolean } })
    .connection?.saveData
  const wanted =
    matchMedia('(display-mode: standalone)').matches ||
    location.pathname.startsWith('/train')
  if (!sw || !navigator.onLine || saveData || !wanted) return
  try {
    if (localStorage.getItem(WARMED) === __BUILD_ID__) return
    localStorage.setItem(WARMED, __BUILD_ID__)
  } catch {
    return
  }
  sw.postMessage({ type: 'keep-files', urls: OFFLINE_FILES })
  for (const path of OFFLINE_PAGES) {
    sw.postMessage({ type: 'keep-page', url: path })
    if (!path.includes('.')) void preload(path).catch(() => {})
  }
}

/** Asks the service worker to keep an offline copy of a page opened in-app. */
export function keepPage(url: string, fresh = false) {
  navigator.serviceWorker?.controller?.postMessage({
    type: 'keep-page',
    url,
    fresh,
  })
}

const KEPT_MINE = 'misri-mine-kept-at'
const KEEP_MINE_EVERY_MS = 30 * 60 * 1000
const KEEP_MINE_MAX = 12

/**
 * The signed-in player's home, inbox, competitions and Analysis, refreshed for
 * offline at most every half hour: the page (for a reload) and its data
 * (preloading runs the page's loader, whose answer the service worker keeps;
 * `keepData` fetches the rest, such as recent games, for the same reason).
 */
export async function keepMine(
  listMine: () => Promise<Array<{ slug: string; status: string }>>,
  preload: (path: string) => Promise<unknown>,
  keepData: () => Promise<unknown> = async () => {},
) {
  const saveData = (navigator as { connection?: { saveData?: boolean } })
    .connection?.saveData
  if (!navigator.serviceWorker?.controller || !navigator.onLine || saveData) {
    return
  }
  try {
    const at = Number(localStorage.getItem(KEPT_MINE))
    if (Date.now() - at < KEEP_MINE_EVERY_MS) return
    localStorage.setItem(KEPT_MINE, String(Date.now()))
  } catch {
    return
  }
  const mine = await listMine()
  const paths = [
    '/',
    '/inbox',
    '/analysis',
    ...mine
      .filter((c) => c.status !== 'finished')
      .slice(0, KEEP_MINE_MAX)
      .map((c) => `/c/${c.slug}`),
  ]
  for (const path of paths) {
    keepPage(path, true)
    await preload(path).catch(() => {})
  }
  await keepData().catch(() => {})
}

const RELOADED_AT = 'misri-reloaded-for'

/**
 * `returning`: the app was just opened or brought back. An installed app has
 * no reload button, so there it loads the new version straight away (before
 * any input); a browser tab, or anyone mid-use, gets the notice instead.
 */
async function checkVersion(returning: boolean) {
  if (updateShown) return
  try {
    const response = await fetch('/api/version', { cache: 'no-store' })
    const { id } = (await response.json()) as { id?: string }
    if (!id || id === 'dev' || id === __BUILD_ID__) return
    if (returning && isStandalone() && reloadOnceFor(id)) {
      location.reload()
      return
    }
    announceUpdate()
  } catch {
    // offline or mid-deploy: try again next time
  }
}

/** True the first time for this build id: a deploy can never cause a loop. */
function reloadOnceFor(id: string) {
  try {
    if (sessionStorage.getItem(RELOADED_AT) === id) return false
    sessionStorage.setItem(RELOADED_AT, id)
    return true
  } catch {
    return false
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
