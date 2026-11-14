import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canJoin, lateEntryMatches } from './join-policy.ts'

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

const now = new Date('2026-11-15T12:00:00Z')
const base = {
  userId: 'new',
  memberIds: ['a', 'b', 'c'],
  round: 7,
  matchdayDays: 2,
  now,
}

test('a late joiner meets each member once in a one-leg league', () => {
  const matches = lateEntryMatches({ ...base, legs: 1, latestDueAt: null })
  assert.equal(matches.length, 3)
  assert.deepEqual(
    matches.map((m) => m.awayId),
    ['a', 'b', 'c'],
  )
  for (const m of matches) {
    assert.equal(m.round, 7)
    assert.equal(m.homeId, 'new')
    assert.equal(m.opensAt, now)
  }
})

test('two legs mean home and away against each member', () => {
  const matches = lateEntryMatches({ ...base, legs: 2, latestDueAt: null })
  assert.equal(matches.length, 6)
  const pairs = new Set(matches.map((m) => `${m.homeId}>${m.awayId}`))
  for (const id of base.memberIds) {
    assert.ok(pairs.has(`new>${id}`))
    assert.ok(pairs.has(`${id}>new`))
  }
})

test('the joiner is never paired with themselves', () => {
  const matches = lateEntryMatches({
    ...base,
    memberIds: ['a', 'new'],
    legs: 1,
    latestDueAt: null,
  })
  assert.equal(matches.length, 1)
})

test('due with the league’s last window, or one matchday from now if later', () => {
  const later = new Date('2026-12-01T00:00:00Z')
  const [m1] = lateEntryMatches({ ...base, legs: 1, latestDueAt: later })
  assert.equal(m1.dueAt.getTime(), later.getTime())

  const earlier = new Date('2026-11-16T00:00:00Z')
  const [m2] = lateEntryMatches({ ...base, legs: 1, latestDueAt: earlier })
  assert.equal(m2.dueAt.getTime(), now.getTime() + 2 * 24 * 60 * 60 * 1000)
})
