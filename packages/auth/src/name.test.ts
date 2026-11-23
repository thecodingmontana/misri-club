import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanName } from './name.ts'

test('names: spaces collapsed, 1-50 characters', () => {
  assert.equal(cleanName('  Amina   K '), 'Amina K')
  assert.equal(cleanName('A'.repeat(50)), 'A'.repeat(50))
  assert.equal(cleanName('A'.repeat(51)), null)
  assert.equal(cleanName('   '), null)
  assert.equal(cleanName(undefined), null)
})

test('names: control and bidi-override characters cannot ride along', () => {
  assert.equal(cleanName('Bob‮evil'), 'Bob evil')
  assert.equal(cleanName('Bob\nwins\t\u0000'), 'Bob wins')
})
