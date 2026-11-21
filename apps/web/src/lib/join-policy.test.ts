import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canJoin, lateRoundWindow, missingFixtures } from './join-policy.ts'

test('anyone may join while a competition is open', () => {
  for (const format of ['league', 'knockout'] as const) {
    for (const allowLateEntry of [true, false]) {
      assert.deepEqual(canJoin({ format, status: 'open', allowLateEntry }), {
        ok: true,
      })
    }
  }
})

test('a running knockout never takes entries', () => {
  for (const allowLateEntry of [true, false]) {
    assert.deepEqual(
      canJoin({ format: 'knockout', status: 'running', allowLateEntry }),
      { ok: false, reason: 'This tournament has started.' },
    )
  }
})

test('a running league takes entries only when late entry is on', () => {
  assert.deepEqual(
    canJoin({ format: 'league', status: 'running', allowLateEntry: true }),
    { ok: true },
  )
  assert.deepEqual(
    canJoin({ format: 'league', status: 'running', allowLateEntry: false }),
    {
      ok: false,
      reason: "This league has started and isn't taking late entries.",
    },
  )
})

test('a finished competition takes nobody', () => {
  for (const format of ['league', 'knockout'] as const) {
    assert.deepEqual(
      canJoin({ format, status: 'finished', allowLateEntry: true }),
      { ok: false, reason: 'This competition has finished.' },
    )
  }
})

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-11-15T12:00:00Z')
const game = (home: string | null, away: string | null) => ({
  homeUserId: home,
  awayUserId: away,
})
// a, b, c played each other once (c had the bye at some point)
const scheduled = [
  game('a', 'b'),
  game('c', 'a'),
  game('b', 'c'),
  game(null, null),
]

test('a full round-robin owes nothing', () => {
  assert.deepEqual(missingFixtures(['a', 'b', 'c'], scheduled, 1), [])
})

test('a late joiner owes each member one game, at home', () => {
  const owed = missingFixtures(['a', 'b', 'c', 'new'], scheduled, 1)
  assert.deepEqual(
    owed.map((m) => `${m.homeId}>${m.awayId}`),
    ['new>a', 'new>b', 'new>c'],
  )
})

test('two legs owe home and away, and only the missing half', () => {
  const owed = missingFixtures(['a', 'new'], [game('new', 'a')], 2)
  assert.deepEqual(owed, [{ leg: 2, homeId: 'a', awayId: 'new' }])
  assert.equal(missingFixtures(['a', 'b', 'new'], [], 2).length, 6)
})

test('two late joiners meet each other too', () => {
  const owed = missingFixtures(['a', 'b', 'c', 'x', 'y'], scheduled, 1)
  assert.ok(owed.some((m) => m.homeId === 'y' && m.awayId === 'x'))
  assert.equal(owed.length, 3 + 4)
})

test('a new late round goes after the last, due with the league or a matchday from now', () => {
  const later = new Date('2026-12-01T00:00:00Z')
  const base = { openLate: null, lastRound: 6, matchdayDays: 2, now }
  assert.deepEqual(lateRoundWindow({ ...base, lastDueAt: later }), {
    round: 7,
    dueAt: later,
  })
  const soon = new Date('2026-11-16T00:00:00Z')
  assert.equal(
    lateRoundWindow({ ...base, lastDueAt: soon }).dueAt.getTime(),
    now.getTime() + 2 * DAY,
  )
})

test('later joiners share the open late round, pushed out to a matchday', () => {
  const base = { lastRound: 7, lastDueAt: null, matchdayDays: 2, now }
  const roomy = new Date(now.getTime() + 5 * DAY)
  assert.deepEqual(
    lateRoundWindow({ ...base, openLate: { round: 7, dueAt: roomy } }),
    { round: 7, dueAt: roomy },
  )
  const tight = new Date(now.getTime() + DAY)
  assert.deepEqual(
    lateRoundWindow({ ...base, openLate: { round: 7, dueAt: tight } }),
    { round: 7, dueAt: new Date(now.getTime() + 2 * DAY) },
  )
})
