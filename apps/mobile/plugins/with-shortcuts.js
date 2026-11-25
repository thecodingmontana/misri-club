// Long-press shortcuts on the app icon (Android static shortcuts). Each opens
// a misri:// link the app's router already knows.
const fs = require('node:fs')
const path = require('node:path')
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require('expo/config-plugins')

const SHORTCUTS = [
  { id: 'join', label: 'Join with a code', url: 'misri://join' },
  { id: 'next', label: 'Next game', url: 'misri://next' },
  { id: 'puzzle', label: 'Daily puzzle', url: 'misri://train/puzzles?daily=1' },
]

const xml = (pkg) => `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${SHORTCUTS.map(
  (s) => `  <shortcut android:shortcutId="${s.id}" android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/shortcut_${s.id}">
    <intent android:action="android.intent.action.VIEW"
      android:targetPackage="${pkg}"
      android:targetClass="${pkg}.MainActivity"
      android:data="${s.url.replace(/&/g, '&amp;')}" />
  </shortcut>`,
).join('\n')}
</shortcuts>
`

module.exports = function withShortcuts(config) {
  config = withStringsXml(config, (mod) => {
    for (const s of SHORTCUTS) {
      mod.modResults = AndroidConfig.Strings.setStringItem(
        [{ $: { name: `shortcut_${s.id}` }, _: s.label }],
        mod.modResults,
      )
    }
    return mod
  })
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'shortcuts.xml'), xml(mod.android.package))
      return mod
    },
  ])
  return withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults)
    activity['meta-data'] = (activity['meta-data'] ?? []).filter(
      (m) => m.$['android:name'] !== 'android.app.shortcuts',
    )
    activity['meta-data'].push({
      $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' },
    })
    return mod
  })
}
