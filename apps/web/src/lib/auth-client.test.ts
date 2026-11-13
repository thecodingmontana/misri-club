import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safePath } from './auth-client.ts'

test('a sign-in redirect stays on this site', () => {
  assert.equal(safePath('/fixtures'), '/fixtures')
  assert.equal(safePath('/players/a?tab=1'), '/players/a?tab=1')

  for (const evil of [
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    'evil.com',
    undefined,
    42,
  ]) {
    assert.equal(safePath(evil), undefined, String(evil))
  }
})
