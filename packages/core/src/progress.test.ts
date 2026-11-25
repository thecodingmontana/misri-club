import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EMPTY,
  streak,
  streakWarningAt,
  weakestThemes,
  withDrill,
  withGuess,
  withPuzzle,
} from './progress.ts'

test('a puzzle counts once per theme, clean or not', () => {
  let p = withPuzzle(EMPTY, ['fork', 'short'], true, '2026-10-14')
  p = withPuzzle(p, ['fork'], false, '2026-10-14')
  assert.deepEqual(p.puzzles.fork, { done: 2, clean: 1 })
  assert.deepEqual(p.puzzles.short, { done: 1, clean: 1 })
  assert.deepEqual(p.solved, { done: 2, clean: 1 }, 'each puzzle counted once')
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

test('weakest themes: lowest clean rate first, only themes tried enough', () => {
  const puzzles = {
    fork: { done: 10, clean: 9 },
    pin: { done: 4, clean: 1 },
    skewer: { done: 5, clean: 2 },
    mateIn2: { done: 2, clean: 0 },
  }
  assert.deepEqual(
    weakestThemes(puzzles, 3, 2).map((w) => w.theme),
    ['pin', 'skewer'],
  )
})

test('the streak warning lands on the evening the streak would end', () => {
  const morning = new Date('2026-03-10T09:00:00')
  const late = new Date('2026-03-10T21:00:00')
  // trained yesterday, not yet today: warn tonight
  assert.equal(
    streakWarningAt(['2026-03-09'], morning)?.toString(),
    new Date('2026-03-10T20:00:00').toString(),
  )
  // too late tonight to warn
  assert.equal(streakWarningAt(['2026-03-09'], late), null)
  // trained today: warn tomorrow evening
  assert.equal(
    streakWarningAt(['2026-03-10'], late)?.toString(),
    new Date('2026-03-11T20:00:00').toString(),
  )
  // no streak at all
  assert.equal(streakWarningAt(['2026-03-01'], morning), null)
})
