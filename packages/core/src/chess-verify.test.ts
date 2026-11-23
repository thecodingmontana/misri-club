import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  newVerificationCode,
  normalizeUsername,
  profileHasCode,
} from './chess-verify.ts'

test('codes look like MISRI-XXXXXX with no look-alike characters', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(newVerificationCode(), /^MISRI-[2-9A-HJ-NP-Z]{6}$/)
  }
})

test('usernames are trimmed, lowercased and checked', () => {
  assert.equal(normalizeUsername('  @Hikaru '), 'hikaru')
  assert.equal(normalizeUsername('edu_237'), 'edu_237')
  assert.equal(normalizeUsername('ab'), null)
  assert.equal(normalizeUsername('has space'), null)
  assert.equal(normalizeUsername('../../etc'), null)
})

test('the code counts in Location or Name, however it is spaced', () => {
  const code = 'MISRI-7K2QXP'
  assert.equal(profileHasCode({ location: 'Nairobi MISRI-7K2QXP' }, code), true)
  assert.equal(profileHasCode({ name: 'misri - 7k2qxp' }, code), true)
  assert.equal(profileHasCode({ location: 'Nairobi' }, code), false)
  assert.equal(profileHasCode({ location: 'MISRI-7K2QXQ' }, code), false)
  assert.equal(profileHasCode({}, code), false)
})
