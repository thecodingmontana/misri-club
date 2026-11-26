import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type BracketMatch,
  generateKnockoutRound1,
  knockoutLegs,
} from './bracket.ts'
import { knockoutStep } from './competition-progress.ts'

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

/** The next round as the app makes it, with every home player winning. */
function homeWins(round: Array<BracketMatch>): Array<BracketMatch> {
  const step = knockoutStep(
    round.map((m, position) => ({
      round: m.round,
      position,
      homeUserId: m.homeId,
      awayUserId: m.awayId,
      byeUserId: m.byeId,
      result: null,
      winnerUserId: m.homeId,
      voided: false,
      dueAt: new Date(0),
    })),
  )
  return step.kind === 'next' ? step.matches : []
}

function assertNobodyTwice(round: Array<BracketMatch>, label: string) {
  const seen = new Set<string>()
  for (const match of round) {
    for (const id of [match.homeId, match.awayId, match.byeId]) {
      if (id === null) continue
      assert.ok(!seen.has(id), `${label}: ${id} twice`)
      seen.add(id)
    }
  }
}

test('brackets for 2 to 17 players halve each round down to a final', () => {
  for (let n = 2; n <= 17; n++) {
    const ids = players(n)
    let round = generateKnockoutRound1(ids)
    let size = 2
    while (size < n) size *= 2

    assert.equal(round.length, size / 2, `n=${n}: round 1 slots`)
    assertNobodyTwice(round, `n=${n} round 1`)
    const listed = round.flatMap((m) => [m.homeId, m.awayId, m.byeId])
    assert.equal(listed.filter(Boolean).length, n, `n=${n}: everyone placed`)
    const byes = round.filter((m) => m.byeId !== null)
    assert.equal(byes.length, size - n, `n=${n}: byes fill the field`)
    // Top seeds get the byes.
    assert.deepEqual(
      byes.map((m) => m.byeId).sort(),
      ids.slice(0, size - n).sort(),
      `n=${n}: byes to top seeds`,
    )

    let roundNumber = 1
    while (round.length > 1) {
      // The home player always wins, so the test is deterministic.
      const next = homeWins(round)
      roundNumber++
      assert.equal(next.length, round.length / 2, `n=${n}: field halves`)
      assertNobodyTwice(next, `n=${n} round ${roundNumber}`)
      for (const match of next) {
        assert.equal(match.round, roundNumber)
        assert.equal(match.byeId, null, `n=${n}: byes only in round 1`)
      }
      round = next
    }
    assert.equal(homeWins(round).length, 0, `n=${n}: the final crowns`)
  }
})

test('the top two seeds can only meet in the final', () => {
  const round1 = generateKnockoutRound1(players(8))
  assert.deepEqual(round1[0], {
    round: 1,
    homeId: 'p1',
    awayId: 'p8',
    byeId: null,
  })
  const final = homeWins(homeWins(round1))
  assert.deepEqual([final[0].homeId, final[0].awayId], ['p1', 'p2'])
})

test('home & away ties get a swapped second leg; byes stay one row', () => {
  const rows = knockoutLegs(
    [
      { round: 1, homeId: 'a', awayId: 'b', byeId: null },
      { round: 1, homeId: null, awayId: null, byeId: 'c' },
    ],
    2,
  )
  assert.deepEqual(
    rows.map((r) => [r.position, r.leg, r.homeId, r.awayId, r.byeId]),
    [
      [0, 1, 'a', 'b', null],
      [0, 2, 'b', 'a', null],
      [1, 1, null, null, 'c'],
    ],
  )
  assert.equal(
    knockoutLegs([{ round: 1, homeId: 'a', awayId: 'b', byeId: null }], 1)
      .length,
    1,
  )
})
