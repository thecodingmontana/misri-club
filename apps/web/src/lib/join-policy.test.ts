import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canJoin,
  lateRoundWindow,
  missingFixtures,
  placeLateGames,
} from './join-policy.ts'

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

// three players, three rounds, one bye each: c sits out round 1, b round 2, a round 3
const roundAt = (round: number, startDay: number) => ({
  round,
  opensAt: new Date(now.getTime() + startDay * DAY),
  dueAt: new Date(now.getTime() + (startDay + 2) * DAY),
})
const threePlayers = (
  byeOf: Record<number, string>,
  playing: Record<number, string[]>,
) =>
  [1, 2, 3].map((round) => ({
    ...roundAt(round, (round - 2) * 2),
    byes: [{ matchId: `bye${round}`, userId: byeOf[round] }],
    busy: new Set(playing[round]),
  }))
const rounds3 = threePlayers(
  { 1: 'c', 2: 'b', 3: 'a' },
  { 1: ['a', 'b'], 2: ['a', 'c'], 3: ['b', 'c'] },
)

test('a late joiner takes the byes of rounds still to come; the rest catch up', () => {
  // round 1 has closed (it ended now); rounds 2 and 3 are still on
  const owed = missingFixtures(
    ['a', 'b', 'c', 'd'],
    [game('a', 'b'), game('c', 'a'), game('b', 'c')],
    1,
  )
  const plan = placeLateGames({
    missing: owed,
    rounds: rounds3,
    now,
    matchdayDays: 2,
  })
  assert.deepEqual(
    plan.fromByes.map(
      (p) => `${p.matchId}:${p.fixture.homeId}v${p.fixture.awayId}`,
    ),
    ['bye2:dvb', 'bye3:dva'],
  )
  assert.deepEqual(
    plan.catchUp.map((f) => `${f.homeId}v${f.awayId}`),
    ['dvc'],
  )
  assert.deepEqual(plan.inRounds, [])
})

test('a round with too little time left is closed to new games', () => {
  const tight = rounds3.map((r) =>
    r.round === 2 ? { ...r, dueAt: new Date(now.getTime() + DAY / 2) } : r,
  )
  const owed = missingFixtures(
    ['a', 'b', 'c', 'd'],
    [game('a', 'b'), game('c', 'a'), game('b', 'c')],
    1,
  )
  const plan = placeLateGames({
    missing: owed,
    rounds: tight,
    now,
    matchdayDays: 2,
  })
  assert.deepEqual(
    plan.fromByes.map((p) => p.matchId),
    ['bye3'],
  )
  assert.equal(plan.catchUp.length, 2)
})

test('nobody plays twice in a round: an even league sends everything to catch-up', () => {
  const full = [2, 3].map((round) => ({
    ...roundAt(round, round),
    byes: [],
    busy: new Set(['a', 'b', 'c', 'd']),
  }))
  const owed = missingFixtures(['a', 'b', 'c', 'd', 'e'], [], 1).filter(
    (f) => f.homeId === 'e',
  )
  const plan = placeLateGames({
    missing: owed,
    rounds: full,
    now,
    matchdayDays: 2,
  })
  assert.equal(plan.catchUp.length, 4)
  assert.equal(plan.fromByes.length + plan.inRounds.length, 0)
})

test('two late joiners meet in a round where both are free', () => {
  const full = [2, 3].map((round) => ({
    ...roundAt(round, round),
    byes: [],
    busy: new Set(['a', 'b']),
  }))
  const owed = missingFixtures(['a', 'b', 'x', 'y'], [game('a', 'b')], 1)
  const plan = placeLateGames({
    missing: owed,
    rounds: full,
    now,
    matchdayDays: 2,
  })
  assert.deepEqual(
    plan.inRounds.map(
      (p) => `${p.round}:${p.fixture.homeId}v${p.fixture.awayId}`,
    ),
    ['2:yvx'],
  )
  assert.equal(plan.catchUp.length, 4, 'their games against a and b catch up')
})
