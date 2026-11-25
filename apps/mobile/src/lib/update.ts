import * as Application from 'expo-application'
import { File, Paths } from 'expo-file-system'
import { getContentUriAsync } from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Notifications from 'expo-notifications'
import { AppState, Platform } from 'react-native'
import * as SecureStore from './storage'

const LATEST =
  'https://api.github.com/repos/thecodingmontana/misri-club/releases/latest'
const LATER_KEY = 'misri.update-later'

export type Note = { kind: 'new' | 'fix'; text: string }

export type Update = {
  /** the release tag, e.g. mobile-v0.1.16 */
  tag: string
  version: string
  /** what's new and what's fixed, from the release's "## New" and "## Fixes" */
  notes: Note[]
  apk: string
  /** the APK's download size in bytes */
  size: number
  /** when it was released, ISO */
  date: string | null
}

/** The APK's versionCode, written into the notes by the workflow; older releases: the tag's last number. */
const buildOf = (tag: string, body: string) =>
  Number(
    /<!-- build: (\d+) -->/.exec(body)?.[1] ?? /(\d+)$/.exec(tag)?.[1] ?? 0,
  )

/**
 * A newer app on GitHub Releases than this one, with its notes; null when
 * up to date or on a build that isn't a release.
 */
export async function checkForUpdate(): Promise<Update | null> {
  if (Platform.OS !== 'android') return null
  const installed = Number(Application.nativeBuildVersion ?? 0)
  if (!installed) return null
  const res = await fetch(LATEST, {
    headers: { accept: 'application/vnd.github+json' },
  })
  // a failed check keeps whatever update is already known
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const release = (await res.json()) as {
    tag_name?: string
    body?: string | null
    published_at?: string | null
    assets?: Array<{ name: string; browser_download_url: string; size: number }>
  }
  const tag = release.tag_name ?? ''
  if (
    !tag.startsWith('mobile-v') ||
    buildOf(tag, release.body ?? '') <= installed
  )
    return null
  const apk = release.assets?.find((a) => a.name.endsWith('.apk'))
  if (!apk) return null
  const notes: Note[] = []
  let kind: Note['kind'] = 'new'
  for (const line of (release.body ?? '').split('\n')) {
    if (/^##\s*fix/i.test(line)) kind = 'fix'
    else if (/^##/.test(line)) kind = 'new'
    else if (line.startsWith('- '))
      notes.push({ kind, text: line.slice(2).trim() })
  }
  return {
    tag,
    version: tag.replace('mobile-v', ''),
    notes: notes.length
      ? notes
      : [{ kind: 'fix', text: 'Improvements and fixes.' }],
    apk: apk.browser_download_url,
    size: apk.size,
    date: release.published_at ?? null,
  }
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
  | { status: 'ready' }
  | { status: 'failed'; error: string }
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

/** Whether this update's APK is already fully downloaded. */
export function downloaded(update: Update) {
  const file = apkFile(update)
  return file.exists && file.size === update.size
}

/**
 * Downloads the update in the app, reporting progress to the store. It keeps
 * going while the page is closed; once done, a notification offers the install
 * if the app is in the background.
 */
export async function startDownload(update: Update) {
  if (state.download.status === 'downloading') return
  const file = apkFile(update)
  if (downloaded(update)) {
    updateStore.set({ download: { status: 'ready' } })
    return
  }
  updateStore.set({
    download: { status: 'downloading', written: 0, total: update.size },
  })
  let shown = 0
  try {
    await File.downloadFileAsync(update.apk, file, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        // a redraw per whole percent, not per network packet
        const total = totalBytes > 0 ? totalBytes : update.size
        const percent = Math.floor((bytesWritten / total) * 100)
        if (percent === shown) return
        shown = percent
        updateStore.set({
          download: { status: 'downloading', written: bytesWritten, total },
        })
      },
    })
    // a cut-off download must never reach the installer
    if (file.size !== update.size) throw new Error('The download was cut off.')
    updateStore.set({ download: { status: 'ready' } })
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
  } catch (error) {
    if (file.exists) file.delete()
    updateStore.set({
      download: {
        status: 'failed',
        error: (error as Error).message.includes('cut off')
          ? 'The download was cut off. Check your connection and try again.'
          : "The download didn't finish. Check your connection and try again.",
      },
    })
  }
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
