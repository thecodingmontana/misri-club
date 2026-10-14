import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY, streak, withDrill, withGuess, withPuzzle } from './progress.ts'

test('a puzzle counts once per theme, clean or not', () => {
  let p = withPuzzle(EMPTY, ['fork', 'short'], true, '2026-10-14')
  p = withPuzzle(p, ['fork'], false, '2026-10-14')
  assert.deepEqual(p.puzzles.fork, { done: 2, clean: 1 })
  assert.deepEqual(p.puzzles.short, { done: 1, clean: 1 })
  assert.deepEqual(p.days, ['2026-10-14'], 'one day, recorded once')
})

test('drills tally per course', () => {
  const p = withDrill(
    withDrill(EMPTY, 'italian-game', false),
    'italian-game',
    true,
  )
  assert.deepEqual(p.openings['italian-game'], { done: 2, clean: 1 })
})

test('guess-the-move keeps only the best result', () => {
  let p = withGuess(EMPTY, 'immortal', 5, 20)
  p = withGuess(p, 'immortal', 3, 20)
  assert.deepEqual(p.masters.immortal, { found: 5, tried: 20 })
  p = withGuess(p, 'immortal', 15, 20)
  assert.deepEqual(p.masters.immortal, { found: 15, tried: 20 })
})

test('the streak counts back from today, or from yesterday if today is not done yet', () => {
  const days = ['2026-10-11', '2026-10-12', '2026-10-13']
  assert.equal(streak(days, '2026-10-14'), 3)
  assert.equal(streak([...days, '2026-10-14'], '2026-10-14'), 4)
  assert.equal(streak(days, '2026-10-16'), 0, 'a missed day breaks it')
  assert.equal(streak([], '2026-10-14'), 0)
})
