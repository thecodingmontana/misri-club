import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openSession, sealSession } from './session.ts'

test('a sealed session opens with its key until it expires', () => {
  const cookie = sealSession('key', 2_000)
  assert.ok(openSession('key', cookie, 1_000))
  assert.ok(!openSession('key', cookie, 2_000), 'expired')
  assert.ok(!openSession('other key', cookie, 1_000), 'rotated passphrase')
})

test('a forged or garbled cookie never opens', () => {
  const [, mac] = sealSession('key', 2_000).split('.')
  assert.ok(!openSession('key', `9999999999999.${mac}`, 1_000), 'extended')
  for (const junk of [undefined, '', '.', '2000', '2000.', 'x.y.z']) {
    assert.ok(!openSession('key', junk, 1_000), String(junk))
  }
})
