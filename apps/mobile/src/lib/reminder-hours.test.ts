import assert from 'node:assert/strict'
import { test } from 'node:test'
import { puzzleHours } from './reminder-hours.ts'

test('reminder hours: off, once a day, or through waking hours', () => {
  assert.deepEqual(puzzleHours(null, 24), [])
  assert.deepEqual(puzzleHours(null, 1), [])
  assert.deepEqual(puzzleHours(8, 24), [8])
  assert.deepEqual(puzzleHours(18, 24), [18])
  assert.deepEqual(puzzleHours(8, 3), [8, 11, 14, 17, 20])
  assert.deepEqual(
    puzzleHours(8, 1),
    [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  )
})
