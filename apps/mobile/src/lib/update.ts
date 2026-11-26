import * as Application from 'expo-application'
import { DownloadTask, File, Paths } from 'expo-file-system'
import { getContentUriAsync } from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Notifications from 'expo-notifications'
import { AppState, Platform } from 'react-native'
import { type Update, updateFrom } from './releases'
import * as SecureStore from './storage'

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
  | { status: 'downloading'; written: number; total: number }
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
  if (state.update && state.update.tag !== update.tag) return
  updateStore.set({ download })
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
    clearOldDownloads()
    updateStore.set({ update: null, open: false, download: { status: 'idle' } })
    return null
  }
  if (known && known.tag !== found.tag) {
    // superseded: stop and delete the older APK; the new one carries its notes
    stopping = 'cancel'
    task?.cancel()
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
let stopping: 'pause' | 'cancel' | null = null
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

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
  // a newer release took this one's place (refreshUpdate): stop here
  const superseded = () =>
    state.update !== null && state.update.tag !== update.tag
  for (let attempt = 0; ; attempt++) {
    if (superseded()) return
    // Android resumes from the partial file's length (a Range request)
    const from = file.exists ? file.size : 0
    setFor(update, { status: 'downloading', written: from, total: update.size })
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
      setFor(update, { status: 'downloading', written: bytesWritten, total })
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
      if (superseded()) return
      if (stopping === 'cancel') return cancelled(update)
      if (stopping === 'pause') return paused(update)
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
  task?.pause()
}

/** Stops the download and throws away what came down. */
export function cancelDownload() {
  stopping = 'cancel'
  const { update, download } = state
  if (task) return task.cancel()
  // paused, failed or waiting to try again: nothing running to stop
  if (update && download.status !== 'downloading') cancelled(update)
}

/** Opens Android's "update this app?" screen for the downloaded APK. */
export async function installUpdate() {
  const { update } = state
  if (!update) return
  const file = apkFile(update)
  if (!file.exists) {
    updateStore.set({ download: { status: 'idle' } })
    return startDownload(update)
  }
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
