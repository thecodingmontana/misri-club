import assert from 'node:assert/strict'
import { test } from 'node:test'
import { updateFrom } from './releases.ts'

const release = (build: number, body: string) => ({
  tag_name: `mobile-v0.1.${build}`,
  body: `${body}\n<!-- build: ${build} -->`,
  published_at: '2026-11-25T10:00:00Z',
  assets: [
    {
      name: 'misri.apk',
      browser_download_url: `https://x/${build}.apk`,
      size: build,
    },
  ],
})

test('skipped versions: the newest APK, with every release’s notes', () => {
  const list = [
    release(42, '## New\n- Widgets\n## Fixes\n- Top bar'),
    release(41, '## New\n- Progress\n## Fixes\n- Top bar'),
    release(40, '## New\n- Puzzles'),
    { ...release(43, '## New\n- Draft'), draft: true },
    { tag_name: 'web-v1', body: '', assets: [] },
  ]
  const update = updateFrom(list, 39)
  assert.equal(update?.tag, 'mobile-v0.1.42')
  assert.equal(update?.apk, 'https://x/42.apk')
  assert.equal(update?.releases, 3)
  assert.deepEqual(
    update?.notes.map((n) => `${n.kind}:${n.text}`),
    ['new:Widgets', 'fix:Top bar', 'new:Progress', 'new:Puzzles'],
  )
  // one behind: just that release
  assert.equal(updateFrom(list, 41)?.releases, 1)
  // up to date
  assert.equal(updateFrom(list, 42), null)
})
