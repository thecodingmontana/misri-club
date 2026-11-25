/**
 * Which update to offer, from GitHub's release list: the newest app release
 * past the installed build, with the notes of every release in between, so
 * skipping versions still shows all that changed. One install catches up:
 * each APK is the whole app.
 */

export type Note = { kind: 'new' | 'fix'; text: string }

export type Update = {
  /** the release tag, e.g. mobile-v0.1.16 */
  tag: string
  version: string
  /** what's new and what's fixed, from the releases' "## New" and "## Fixes" */
  notes: Note[]
  apk: string
  /** the APK's download size in bytes */
  size: number
  /** when it was released, ISO */
  date: string | null
  /** how many releases this one brings in (2 or more: versions were skipped) */
  releases: number
}

export type Release = {
  tag_name?: string
  body?: string | null
  draft?: boolean
  prerelease?: boolean
  published_at?: string | null
  assets?: Array<{ name: string; browser_download_url: string; size: number }>
}

/** The APK's versionCode, written into the notes by the workflow; older releases: the tag's last number. */
const buildOf = (release: Release) =>
  Number(
    /<!-- build: (\d+) -->/.exec(release.body ?? '')?.[1] ??
      /(\d+)$/.exec(release.tag_name ?? '')?.[1] ??
      0,
  )

function notesOf(body: string): Note[] {
  const notes: Note[] = []
  let kind: Note['kind'] = 'new'
  for (const line of body.split('\n')) {
    if (/^##\s*fix/i.test(line)) kind = 'fix'
    else if (/^##/.test(line)) kind = 'new'
    else if (line.startsWith('- '))
      notes.push({ kind, text: line.slice(2).trim() })
  }
  return notes
}

export function updateFrom(
  releases: Array<Release>,
  installed: number,
): Update | null {
  const newer = releases
    .filter(
      (r) =>
        !r.draft &&
        !r.prerelease &&
        r.tag_name?.startsWith('mobile-v') &&
        r.assets?.some((a) => a.name.endsWith('.apk')) &&
        buildOf(r) > installed,
    )
    .sort((a, b) => buildOf(b) - buildOf(a))
  const latest = newer[0]
  if (!latest?.tag_name) return null
  const apk = latest.assets?.find((a) => a.name.endsWith('.apk'))
  if (!apk) return null
  // newest first; a note repeated across releases shows once
  const seen = new Set<string>()
  const notes = newer
    .flatMap((r) => notesOf(r.body ?? ''))
    .filter((n) => !seen.has(n.text) && seen.add(n.text))
  return {
    tag: latest.tag_name,
    version: latest.tag_name.replace('mobile-v', ''),
    notes: notes.length
      ? notes
      : [{ kind: 'fix', text: 'Improvements and fixes.' }],
    apk: apk.browser_download_url,
    size: apk.size,
    date: latest.published_at ?? null,
    releases: newer.length,
  }
}
