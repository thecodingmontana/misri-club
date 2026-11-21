import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDate } from './format.ts'

test('dates are the club’s day, whatever zone renders them', () => {
  // 22:30 UTC is already the next day in Nairobi
  assert.equal(formatDate(Date.parse('2026-03-12T22:30:00Z')), 'Mar 13, 2026')
})
