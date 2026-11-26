import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownerChanged } from './session-cache.ts'

test("another account's sign-in wipes this browser's offline copies", () => {
  assert.equal(ownerChanged(null, 'a'), false, 'first sign-in: nothing to wipe')
  assert.equal(ownerChanged('a', 'a'), false, 'same account: keep')
  assert.equal(ownerChanged('a', 'b'), true, 'someone else: wipe')
})
