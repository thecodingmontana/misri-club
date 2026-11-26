import * as Application from 'expo-application'
import { DownloadTask, File, Paths } from 'expo-file-system'
import { getContentUriAsync } from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Notifications from 'expo-notifications'
import { AppState, Platform } from 'react-native'
import { downloadNotice } from '../../modules/update-service'
import { type Update, updateFrom } from './releases'
import * as SecureStore from './storage'
import { timeLeft } from './time-left'

export type { Note, Update } from './releases'

// recent releases, enough to cover any version someone skipped
const RELEASES =
  'https://api.github.com/repos/thecodingmontana/misri-club/releases?per_page=30'
const LATER_KEY = 'misri.update-later'

/**
 * A newer app on GitHub Releases than this one, with what changed since
 * yours; null when up to date or on a build that isn't a release.
 */
export async function checkForUpdate(): Promise<Update | null> {
  if (Platform.OS !== 'android') return null
  const installed = Number(Application.nativeBuildVersion ?? 0)
  if (!installed) return null
  const res = await fetch(RELEASES, {
    headers: { accept: 'application/vnd.github+json' },
    // always the newest list, never a copy kept from an earlier check
    cache: 'no-store',
  })
  // a failed check keeps whatever update is already known
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return updateFrom(await res.json(), installed)
}

/** "Later": the page doesn't open by itself again for this release. */
export async function putOff(tag: string) {
  await SecureStore.setItemAsync(LATER_KEY, tag).catch(() => {})
}

/** Whether this release was already put off (the top bar still offers it). */
export async function wasPutOff(tag: string) {
  return (await SecureStore.getItemAsync(LATER_KEY).catch(() => null)) === tag
}

// The update found, and whether its page is open: shared by the page and the
// top bar's Update button, so an update stays one tap away until installed.
export type Download =
  | { status: 'idle' }
  | {
      status: 'downloading'
      written: number
      total: number
      /** bytes a second over this stretch; 0 until there's enough to tell */
      speed: number
    }
  | { status: 'paused'; written: number; total: number }
  | { status: 'ready' }
  | { status: 'failed'; error: string; written: number; total: number }
type State = { update: Update | null; open: boolean; download: Download }
let state: State = { update: null, open: false, download: { status: 'idle' } }
const listeners = new Set<() => void>()
export const updateStore = {
  get: () => state,
  set(next: Partial<State>) {
    state = { ...state, ...next }
    for (const listen of listeners) listen()
  },
  subscribe(listen: () => void) {
    listeners.add(listen)
    return () => listeners.delete(listen)
  },
}

// The APK is downloaded inside the app, into its cache, and handed to Android's
// installer from there: no browser, no Downloads folder.
const apkFile = (update: Update) =>
  new File(Paths.cache, `misri-${update.version}.apk`)

/**
 * Where this update's download stands on this phone: ready, part-way (paused,
 * say before the app was closed; it carries on from there), or not started.
 */
export function keptDownload(update: Update): Download {
  const file = apkFile(update)
  if (!file.exists) return { status: 'idle' }
  if (file.size === update.size) return { status: 'ready' }
  if (file.size > update.size) {
    file.delete()
    return { status: 'idle' }
  }
  return { status: 'paused', written: file.size, total: update.size }
}

/**
 * A download's progress, kept only while its version is still the update on
 * offer: a newer release replaces it (see refreshUpdate), and the old
 * download's last words mustn't overwrite the new one's state.
 */
function setFor(update: Update, download: Download) {
  if (state.update?.tag !== update.tag) return
  updateStore.set({ download })
  syncNotice(update, download)
}

// Whether the ongoing "Downloading Misri…" notice (a foreground service) is
// up: while it is, Android lets the download run with Misri in the background.
let noticeOn = false
export const megabytes = (bytes: number) =>
  `${(bytes / 1024 / 1024).toFixed(1)} MB`

function syncNotice(update: Update, download: Download) {
  if (download.status !== 'downloading') {
    if (noticeOn) downloadNotice.stop()
    noticeOn = false
    return
  }
  const { written, total, speed } = download
  const title = `Downloading Misri ${update.version}`
  const text = [
    `${megabytes(written)} of ${megabytes(total)}`,
    timeLeft(total - written, speed),
  ]
    .filter(Boolean)
    .join(' · ')
  const percent = total ? Math.round((written / total) * 100) : -1
  // Android only lets it start while Misri is on screen; until then, retry
  if (!noticeOn) noticeOn = downloadNotice.start(title, text, percent)
  else downloadNotice.progress(title, text, percent)
}

// at most this often: GitHub allows 60 unauthenticated checks an hour
const MIN_CHECK_GAP_MS = 60_000
let lastCheck = 0

/**
 * Asks GitHub for the newest release and brings the store up to date: a newer
 * version than the one on offer replaces it (its old download is dropped),
 * with that version's own download state. Skipped when checked within
 * `minGap`; returns the update on offer, if any.
 */
export async function refreshUpdate(minGap = MIN_CHECK_GAP_MS) {
  if (Date.now() - lastCheck < minGap) return state.update
  lastCheck = Date.now()
  const found = await checkForUpdate()
  const known = state.update
  if (!found) {
    // a release pulled mid-download: stop it before its file goes
    run++
    stopping = 'cancel'
    task?.cancel()
    downloadNotice.stop()
    noticeOn = false
    clearOldDownloads()
    updateStore.set({ update: null, open: false, download: { status: 'idle' } })
    return null
  }
  if (known && known.tag !== found.tag) {
    // superseded: stop and delete the older APK; the new one carries its notes
    stopping = 'cancel'
    task?.cancel()
    downloadNotice.stop()
    noticeOn = false
    const old = apkFile(known)
    if (old.exists) old.delete()
  }
  const same = known?.tag === found.tag
  updateStore.set({
    update: found,
    download:
      same && state.download.status === 'downloading'
        ? state.download
        : keptDownload(found),
  })
  return found
}

// a dropped connection is tried again by itself this many times, waiting longer
const RETRY_AFTER_MS = [3_000, 10_000, 30_000]
let task: DownloadTask | null = null
// each download run's number: a newer one, or a stop, ends an older one
let run = 0
let stopping: 'pause' | 'cancel' | null = null
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

// Android may cut the connection while Misri is in the background (another
// app opened): that's not a failure, the download carries on on return.
let awaySince = 0
AppState.addEventListener('change', (next) => {
  if (next !== 'active' && !awaySince) awaySince = Date.now()
})
const whenActive = () =>
  new Promise<void>((done) => {
    if (AppState.currentState === 'active') return done()
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      sub.remove()
      done()
    })
  })

/**
 * Downloads the update in the app, reporting progress to the store, carrying
 * on from whatever part is already on the phone. It keeps going while the page
 * is closed; once done, a notification offers the install if the app is in the
 * background.
 */
export async function startDownload(update: Update) {
  if (state.download.status === 'downloading') return
  const file = apkFile(update)
  const kept = keptDownload(update)
  if (kept.status === 'ready') return setFor(update, kept)
  stopping = null
  const mine = ++run
  // a newer release took this one's place, or this run was stopped while it
  // waited to try again (pause, cancel, a pulled release): stop here
  const superseded = () => mine !== run || state.update?.tag !== update.tag
  for (let attempt = 0; ; attempt++) {
    if (superseded()) return
    // Android resumes from the partial file's length (a Range request)
    const from = file.exists ? file.size : 0
    const startedAt = Date.now()
    awaySince = AppState.currentState === 'active' ? 0 : startedAt
    setFor(update, {
      status: 'downloading',
      written: from,
      total: update.size,
      speed: 0,
    })
    let shown = Math.floor((from / update.size) * 100)
    const onProgress = ({
      bytesWritten,
      totalBytes,
    }: {
      bytesWritten: number
      totalBytes: number
    }) => {
      // a redraw per whole percent, not per network packet
      const total = totalBytes > 0 ? totalBytes : update.size
      const percent = Math.floor((bytesWritten / total) * 100)
      if (percent === shown) return
      shown = percent
      // this stretch's average: steady enough for an estimate, after a moment
      const seconds = (Date.now() - startedAt) / 1000
      const speed = seconds >= 2 ? (bytesWritten - from) / seconds : 0
      setFor(update, {
        status: 'downloading',
        written: bytesWritten,
        total,
        speed,
      })
    }
    const current =
      from > 0
        ? DownloadTask.fromSavable(
            {
              url: update.apk,
              fileUri: file.uri,
              isDirectory: false,
              resumeData: String(from),
            },
            { onProgress },
          )
        : File.createDownloadTask(update.apk, file, { onProgress })
    task = current
    try {
      const done =
        from > 0 ? await current.resumeAsync() : await current.downloadAsync()
      // null: paused; the part downloaded stays for Resume
      if (!done) return paused(update)
      break
    } catch {
      // nothing runs while it waits to try again: Pause and Cancel act at once
      if (task === current) task = null
      if (superseded()) return
      if (stopping === 'cancel') return cancelled(update)
      if (stopping === 'pause') return paused(update)
      // cut off while in another app (without the notice keeping Misri
      // running): carry on once back, not a failed try
      if (awaySince && !noticeOn) {
        await whenActive()
        if (superseded()) return
        if (stopping === 'cancel') return cancelled(update)
        if (stopping === 'pause') return paused(update)
        attempt = -1
        continue
      }
      const delay = RETRY_AFTER_MS[attempt]
      if (delay === undefined) {
        return setFor(update, {
          status: 'failed',
          error:
            'The download stopped. Check your connection; it carries on from where it got to.',
          written: file.exists ? file.size : 0,
          total: update.size,
        })
      }
      await wait(delay)
      if (superseded()) return
      // paused or cancelled while waiting to try again
      if (stopping === 'cancel') return cancelled(update)
      if (stopping === 'pause') return paused(update)
    } finally {
      if (task === current) task = null
      current.release()
    }
  }
  // a wrong-sized file must never reach the installer: start again next time
  if (file.size !== update.size) {
    if (file.exists) file.delete()
    return setFor(update, {
      status: 'failed',
      error: "The download didn't come through whole. Try again.",
      written: 0,
      total: update.size,
    })
  }
  setFor(update, { status: 'ready' })
  if (AppState.currentState !== 'active') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Misri ${update.version} is ready to install`,
        body: 'Tap to update. Your account and settings stay.',
        data: { install: true },
      },
      trigger: null,
    }).catch(() => {})
  }
}

function paused(update: Update) {
  const file = apkFile(update)
  setFor(update, {
    status: 'paused',
    written: file.exists ? file.size : 0,
    total: update.size,
  })
}

function cancelled(update: Update) {
  const file = apkFile(update)
  if (file.exists) file.delete()
  setFor(update, { status: 'idle' })
}

/** Stops the download for now; Resume carries on from the same point. */
export function pauseDownload() {
  stopping = 'pause'
  if (task) return task.pause()
  // waiting to try again: nothing running, so pause at once
  const { update, download } = state
  if (update && download.status === 'downloading') {
    run++
    paused(update)
  }
}

/** Stops the download and throws away what came down. */
export function cancelDownload() {
  stopping = 'cancel'
  const { update } = state
  if (task) return task.cancel()
  // paused, failed or waiting to try again: nothing running, so at once
  run++
  if (update) cancelled(update)
}

/** Opens Android's "update this app?" screen for the downloaded APK. */
export async function installUpdate() {
  const { update } = state
  if (!update) return
  // only a whole file, of the update on offer, ever reaches the installer
  if (keptDownload(update).status !== 'ready') return startDownload(update)
  const file = apkFile(update)
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: await getContentUriAsync(file.uri),
    type: 'application/vnd.android.package-archive',
    // FLAG_GRANT_READ_URI_PERMISSION: the installer may read our file
    flags: 1,
  })
}

/** Up to date: APKs from earlier updates only take space. */
export function clearOldDownloads() {
  if (Platform.OS !== 'android') return
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && /^misri-.*\.apk$/.test(entry.name))
        entry.delete()
    }
  } catch {
    // nothing to tidy
  }
}
