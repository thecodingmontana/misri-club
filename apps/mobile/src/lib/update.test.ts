import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

// Stand-ins for the phone: files, the download task, notifications.
type Fake = {
  files: Map<string, number>
  // what each download attempt does: 'fail' (connection drops) or 'finish'
  attempts: Array<'fail' | 'finish'>
  started: number
}
const g = globalThis as unknown as { __fake: Fake }
g.__fake = { files: new Map(), attempts: [], started: 0 }
const stub = (source: string) =>
  `data:text/javascript,${encodeURIComponent(source)}`
const STUBS: Record<string, string> = {
  'expo-file-system': stub(`
    const f = () => globalThis.__fake
    export const Paths = { cache: 'cache' }
    export class File {
      constructor(dir, name) { this.uri = dir + '/' + name }
      get exists() { return f().files.has(this.uri) }
      get size() { return f().files.get(this.uri) ?? 0 }
      delete() { f().files.delete(this.uri) }
      static createDownloadTask(url, file) { return task(file.uri) }
    }
    export const DownloadTask = { fromSavable: (s) => task(s.fileUri) }
    function task(uri) {
      const run = async () => {
        f().started++
        if (f().attempts.shift() === 'fail') throw new TypeError('dropped')
        f().files.set(uri, 1000)
        return {}
      }
      return { downloadAsync: run, resumeAsync: run, pause() {}, cancel() {}, release() {} }
    }`),
  'expo-application': stub('export const nativeBuildVersion = "1"'),
  'expo-file-system/legacy': stub(
    'export const getContentUriAsync = async () => ""',
  ),
  'expo-intent-launcher': stub(
    'export const startActivityAsync = async () => ({})',
  ),
  'expo-notifications': stub(
    'export const scheduleNotificationAsync = async () => {}',
  ),
  'react-native': stub(`export const Platform = { OS: 'android' }
    export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) }`),
  '../../modules/update-service': stub(
    'export const downloadNotice = { start: () => false, progress() {}, stop() {} }',
  ),
  './storage': stub(
    'export const getItemAsync = async () => null; export const setItemAsync = async () => {}',
  ),
}
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true }
    try {
      return next(specifier, context)
    } catch (error) {
      // the app's bundler finds ./releases.ts from ./releases; Node needs the .ts
      if (specifier.startsWith('.')) return next(`${specifier}.ts`, context)
      throw error
    }
  },
})
const { pauseDownload, startDownload, updateStore } = await import(
  './update.ts'
)

const update = {
  tag: 'mobile-v0.1.9',
  version: '0.1.9',
  notes: [],
  apk: 'https://example.test/misri.apk',
  size: 1000,
  date: null,
  releases: 1,
}

test('pausing while a dropped download waits to retry pauses at once, and resuming wins', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  g.__fake.attempts = ['fail', 'finish']
  updateStore.set({ update, download: { status: 'idle' } })

  const first = startDownload(update)
  await new Promise((r) => setImmediate(r)) // the first try fails; it waits 3s
  assert.equal(updateStore.get().download.status, 'downloading')

  pauseDownload()
  assert.equal(
    updateStore.get().download.status,
    'paused',
    'at once, not after the wait',
  )

  await startDownload(update) // Resume: a new run, which finishes
  assert.equal(updateStore.get().download.status, 'ready')

  t.mock.timers.tick(3_000) // the old run's wait ends: it must stand down
  await first
  assert.equal(updateStore.get().download.status, 'ready')
  assert.equal(g.__fake.started, 2, 'no third download from the old run')
})
