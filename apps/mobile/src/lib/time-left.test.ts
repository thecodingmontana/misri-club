import assert from 'node:assert/strict'
import { test } from 'node:test'
import { speedLabel, timeLeft } from './time-left.ts'

const MB = 1024 * 1024

test('time left reads in seconds, minutes or hours', () => {
  assert.equal(timeLeft(10 * MB, 0), null)
  assert.equal(timeLeft(2 * MB, MB), 'Almost done')
  assert.equal(timeLeft(22 * MB, MB), 'About 25 s left')
  assert.equal(timeLeft(150 * MB, MB), 'About 3 min left')
  assert.equal(timeLeft(50 * MB, 10 * 1024), 'About 1 h 25 min left')
})

test('speed in MB/s, or KB/s when slower', () => {
  assert.equal(speedLabel(1.44 * MB), '1.4 MB/s')
  assert.equal(speedLabel(300 * 1024), '300 KB/s')
  assert.equal(speedLabel(10), '1 KB/s')
})
