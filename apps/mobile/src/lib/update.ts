import * as Application from 'expo-application'
import { Platform } from 'react-native'
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

/** The build number in a release tag (mobile-v0.1.<build>), as Android's versionCode. */
const buildOf = (tag: string) => Number(/(\d+)$/.exec(tag)?.[1] ?? 0)

/**
 * A newer app on GitHub Releases than this one, with its "What's new" lines;
 * null when up to date, already put off, or on a build that isn't a release.
 */
export async function checkForUpdate(): Promise<Update | null> {
  if (Platform.OS !== 'android') return null
  const installed = Number(Application.nativeBuildVersion ?? 0)
  if (!installed) return null
  const res = await fetch(LATEST, {
    headers: { accept: 'application/vnd.github+json' },
  })
  if (!res.ok) return null
  const release = (await res.json()) as {
    tag_name?: string
    body?: string | null
    published_at?: string | null
    assets?: Array<{ name: string; browser_download_url: string; size: number }>
  }
  const tag = release.tag_name ?? ''
  if (!tag.startsWith('mobile-v') || buildOf(tag) <= installed) return null
  if ((await SecureStore.getItemAsync(LATER_KEY).catch(() => null)) === tag) {
    return null
  }
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

/** "Later": don't ask again about this release (a newer one asks again). */
export async function putOff(tag: string) {
  await SecureStore.setItemAsync(LATER_KEY, tag).catch(() => {})
}
