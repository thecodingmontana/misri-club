import assert from 'node:assert/strict'
import { randomBytes, scryptSync } from 'node:crypto'
import { test } from 'node:test'
import { openSession, sealSession, verifyPassword } from './session.ts'

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

test('a passphrase checks out only against its own scrypt hash', () => {
  // Same format and parameters as scripts/set-admin-password.mjs prints.
  const salt = randomBytes(16)
  const key = scryptSync('correct horse battery', salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  })
  const stored = `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`

  assert.equal(verifyPassword('correct horse battery', stored), true)
  assert.equal(verifyPassword('correct horse batterz', stored), false)
  assert.equal(verifyPassword('', stored), false)
  assert.equal(verifyPassword('correct horse battery', 'garbage'), false)
  assert.equal(
    verifyPassword('correct horse battery', stored.replace('$8$', '$x$')),
    false,
  )
})
