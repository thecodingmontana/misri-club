import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fitsTimeControl,
  isTimeControl,
  speedOf,
  timeControlLabel,
} from './time-control.ts'

test('accepts any, speeds and presets only', () => {
  for (const v of ['any', 'blitz', '180+2', '1/86400'])
    assert.equal(isTimeControl(v), true, v)
  for (const v of ['', 'fast', '181+2', 'blitz+1'])
    assert.equal(isTimeControl(v), false, v)
})

test('a preset belongs to its speed', () => {
  assert.equal(speedOf('180+2'), 'blitz')
  assert.equal(speedOf('900+10'), 'rapid')
  assert.equal(speedOf('any'), null)
})

test('labels read like chess.com', () => {
  assert.equal(timeControlLabel('any'), 'Any time control')
  assert.equal(timeControlLabel('blitz'), 'Blitz (any clock)')
  assert.equal(timeControlLabel('180+2'), 'Blitz 3+2')
  assert.equal(timeControlLabel('600'), 'Rapid 10 min')
  assert.equal(timeControlLabel('1/259200'), 'Daily 3 days per move')
})

test('games fit by speed or by exact clock', () => {
  const blitz32 = { time_class: 'blitz', time_control: '180+2' }
  assert.equal(fitsTimeControl('any', blitz32), true)
  assert.equal(fitsTimeControl('blitz', blitz32), true)
  assert.equal(fitsTimeControl('180+2', blitz32), true)
  assert.equal(fitsTimeControl('300', blitz32), false)
  assert.equal(fitsTimeControl('rapid', blitz32), false)
})
