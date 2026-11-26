import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

// Stand-ins for what only exists on a phone: storage, notifications, the API.
const g = globalThis as unknown as {
  __store: Map<string, string>
  __failReads: number
}
g.__failReads = 0
g.__store = new Map()
const stub = (source: string) =>
  `data:text/javascript,${encodeURIComponent(source)}`
const STUBS: Record<string, string> = {
  './storage': stub(`const s = globalThis.__store
    export const getItemAsync = async (k) => {
      if (globalThis.__failReads > 0) { globalThis.__failReads--; throw new Error('read') }
      return s.get(k) ?? null }
    export const setItemAsync = async (k, v) => { s.set(k, v) }
    export const deleteItemAsync = async (k) => { s.delete(k) }`),
  'expo-notifications': stub(
    'export const scheduleNotificationAsync = async () => {}',
  ),
  'react-native': stub(`export const Platform = { OS: 'android' }`),
  '@misri/api-client': stub(`export class ApiError extends Error {
    constructor(m, refused = false) { super(m); this.refused = refused } }`),
}
registerHooks({
  resolve: (specifier, context, next) =>
    STUBS[specifier]
      ? { url: STUBS[specifier], shortCircuit: true }
      : next(specifier, context),
})
const { clearOutbox, flushOutbox, sendOrQueue } = await import('./outbox.ts')

const stored = () => JSON.parse(g.__store.get('misri.outbox.v1') ?? '[]')
const offline = { act: async () => Promise.reject(new TypeError('offline')) }
/** An API whose first send waits until `release()`; records what was sent. */
function slowApi() {
  const sent: string[] = []
  let release = () => {}
  const first = new Promise<void>((done) => {
    release = done
  })
  return {
    sent,
    release: () => release(),
    api: {
      act: async (name: string) => {
        if (sent.length === 0) await first
        sent.push(name)
      },
    },
  }
}

test('an action queued while a flush is sending is kept and sent', async () => {
  g.__store.clear()
  await sendOrQueue(offline as never, 'reportResult', { a: 1 })
  const { api, sent, release } = slowApi()
  const flush = flushOutbox(api as never)
  await new Promise((r) => setTimeout(r, 10)) // the flush is mid-send
  await sendOrQueue(offline as never, 'concedeMatch', { b: 2 })
  release()
  await flush
  assert.deepEqual(sent, ['reportResult', 'concedeMatch'])
  assert.deepEqual(stored(), [])
})

test('two actions queued at once are both kept', async () => {
  g.__store.clear()
  await Promise.all([
    sendOrQueue(offline as never, 'reportResult', {}),
    sendOrQueue(offline as never, 'answerReport', {}),
  ])
  assert.equal(stored().length, 2)
})

test('signing out mid-flush stops it, and nothing comes back', async () => {
  g.__store.clear()
  await sendOrQueue(offline as never, 'reportResult', {})
  await sendOrQueue(offline as never, 'concedeMatch', {})
  const { api, sent, release } = slowApi()
  const flush = flushOutbox(api as never)
  await new Promise((r) => setTimeout(r, 10))
  await clearOutbox()
  release()
  await flush
  assert.deepEqual(sent, ['reportResult'], 'the second is not sent')
  assert.deepEqual(stored(), [], 'and the list stays empty')
})

test('two old entries sharing a timestamp: sending one keeps the other', async () => {
  g.__store.clear()
  const old = { name: 'reportResult', input: {}, at: 5 }
  g.__store.set(
    'misri.outbox.v1',
    JSON.stringify([old, { ...old, name: 'concedeMatch' }]),
  )
  const sent: string[] = []
  // the first goes; the second finds the server unreachable and stays
  const api = {
    act: async (name: string) => {
      if (sent.length) throw new TypeError('offline')
      sent.push(name)
    },
  }
  await flushOutbox(api as never)
  assert.deepEqual(sent, ['reportResult'])
  assert.deepEqual(
    stored().map((i: { name: string }) => i.name),
    ['concedeMatch'],
  )
})

test('a sign-out while sending keeps nothing for the next account', async () => {
  g.__store.clear()
  let fail = () => {}
  const api = {
    act: () =>
      new Promise((_, reject) => {
        fail = () => reject(new TypeError('offline'))
      }),
  }
  const sending = sendOrQueue(api as never, 'reportResult', {})
  await clearOutbox()
  fail()
  await sending
  assert.deepEqual(stored(), [])
})

test('a failed read after sending keeps the rest of the list', async () => {
  await clearOutbox()
  await sendOrQueue(offline as never, 'reportResult', { n: 1 })
  await sendOrQueue(offline as never, 'concedeMatch', { n: 2 })
  const sent: string[] = []
  const api = {
    act: async (name: string) => {
      sent.push(name)
      g.__failReads = 1 // the reread after this send fails
    },
  }
  await flushOutbox(api as never)
  assert.deepEqual(sent, ['reportResult'], 'stopped after the failed read')
  assert.deepEqual(
    stored().map((i: { name: string }) => i.name),
    ['reportResult', 'concedeMatch'],
    'nothing lost',
  )
})
