import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startDay } from './actions.ts'

test('a start day must exist and be from tomorrow on', () => {
  const next = new Date().getUTCFullYear() + 1
  assert.equal(
    startDay(`${next}-03-02`).toISOString(),
    `${next}-03-02T05:00:00.000Z`,
    "that morning's daily run",
  )
  assert.throws(() => startDay(`${next}-02-30`), /real date/, '30 February')
  assert.throws(() => startDay(`${next}-13-01`), /real date/, 'month 13')
  assert.throws(() => startDay('2020-01-01'), /from tomorrow/)
})
