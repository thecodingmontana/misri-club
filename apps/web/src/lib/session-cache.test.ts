import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claimDevice, ownerChanged } from './session-cache.ts'

test("another account's sign-in wipes this browser's offline copies", () => {
  assert.equal(ownerChanged(null, 'a'), false, 'first sign-in: nothing to wipe')
  assert.equal(ownerChanged('a', 'a'), false, 'same account: keep')
  assert.equal(ownerChanged('a', 'b'), true, 'someone else: wipe')
})

test('a failed wipe keeps the last owner, so the next claim wipes again', async () => {
  const stored = new Map([['misri-device-user', 'a']])
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => stored.set(k, v),
      removeItem: (k: string) => stored.delete(k),
    },
  })
  let fails = true
  Object.assign(globalThis, {
    caches: { delete: async () => (fails ? Promise.reject() : true) },
  })
  assert.equal(await claimDevice('b'), false, 'wipe failed: page held')
  assert.equal(stored.get('misri-device-user'), 'a', 'owner unchanged')
  fails = false
  assert.equal(await claimDevice('b'), true, 'retried and wiped')
  assert.equal(stored.get('misri-device-user'), 'b')
})
