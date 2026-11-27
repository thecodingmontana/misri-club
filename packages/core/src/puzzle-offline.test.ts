import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closestPuzzle } from './puzzle.ts'

test('offline puzzles: the nearest kept one to what was asked', () => {
  const kept = [
    { theme: null, difficulty: 'normal' as const },
    { theme: 'fork' as const, difficulty: 'harder' as const },
    { theme: 'fork' as const, difficulty: 'normal' as const },
  ]
  assert.equal(closestPuzzle(kept, 'fork', 'normal'), 2, 'theme and difficulty')
  assert.equal(closestPuzzle(kept, 'fork', 'easiest'), 1, 'the theme first')
  assert.equal(closestPuzzle(kept, 'pin', 'normal'), 0, 'else the difficulty')
  assert.equal(closestPuzzle(kept, undefined, 'hardest'), 2, 'else any')
  assert.equal(closestPuzzle([], 'fork', 'normal'), -1, 'none kept')
})
