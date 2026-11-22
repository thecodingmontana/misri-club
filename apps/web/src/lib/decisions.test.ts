import assert from 'node:assert/strict'
import { test } from 'node:test'
import { concedeTo, decisionFields, reportFor, winnerOf } from './decisions.ts'

const DAY = 24 * 60 * 60 * 1000
const match = { homeUserId: 'h', awayUserId: 'a', dueAt: new Date(10 * DAY) }

test('winnerOf: white, black, draw', () => {
  assert.equal(winnerOf('white', 'w', 'b'), 'w')
  assert.equal(winnerOf('black', 'w', 'b'), 'b')
  assert.equal(winnerOf('draw', 'w', 'b'), null)
})

test('a league result records who had white, no winner', () => {
  const fields = decisionFields(
    { kind: 'result', result: 'black', homeWhite: false },
    match,
    false,
  )
  assert.equal(fields.whiteUserId, 'a')
  assert.equal(fields.result, 'black')
  assert.equal(fields.winnerUserId, null)
  assert.equal(fields.voided, false)
})

test('a knockout result names the winner', () => {
  const fields = decisionFields(
    { kind: 'result', result: 'black', homeWhite: false },
    match,
    true,
  )
  assert.equal(fields.winnerUserId, 'h')
})

test('a knockout tie cannot be a draw or called off', () => {
  assert.throws(() =>
    decisionFields(
      { kind: 'result', result: 'draw', homeWhite: true },
      match,
      true,
    ),
  )
  assert.throws(() => decisionFields({ kind: 'void' }, match, true))
})

test('a walkover goes to one of the two players only', () => {
  assert.equal(
    decisionFields({ kind: 'walkover', winnerUserId: 'a' }, match, false)
      .winnerUserId,
    'a',
  )
  assert.throws(() =>
    decisionFields({ kind: 'walkover', winnerUserId: 'x' }, match, false),
  )
})

test('extending counts from the deadline, or from now once it passed', () => {
  const early = decisionFields(
    { kind: 'extend', days: 2 },
    match,
    false,
    5 * DAY,
  )
  assert.equal(early.dueAt?.getTime(), 12 * DAY)
  const late = decisionFields(
    { kind: 'extend', days: 2 },
    match,
    false,
    20 * DAY,
  )
  assert.equal(late.dueAt?.getTime(), 22 * DAY)
  assert.equal(late.remindedAt, null)
})

test('reopening clears the result and the game', () => {
  const fields = decisionFields({ kind: 'reopen' }, match, false)
  assert.equal(fields.result, null)
  assert.equal(fields.winnerUserId, null)
  assert.equal(fields.gameUrl, null)
})

test('a player concedes to their opponent, only on an undecided match of theirs', () => {
  const open = {
    homeUserId: 'h',
    awayUserId: 'a',
    result: null,
    winnerUserId: null,
    voided: false,
  }
  assert.equal(concedeTo(open, 'h'), 'a')
  assert.equal(concedeTo(open, 'a'), 'h')
  assert.throws(() => concedeTo(open, 'x'), /not playing/)
  assert.throws(
    () => concedeTo({ ...open, result: 'draw' }, 'h'),
    /already decided/,
  )
  assert.throws(
    () => concedeTo({ ...open, winnerUserId: 'a' }, 'h'),
    /already decided/,
  )
  assert.throws(
    () => concedeTo({ ...open, voided: true }, 'h'),
    /already decided/,
  )
  assert.throws(
    () => concedeTo({ ...open, awayUserId: null }, 'h'),
    /no opponent/,
  )
})

test('a report means the result the player described', () => {
  const match = { homeUserId: 'h', awayUserId: 'a' }
  // home won with white
  assert.deepEqual(reportFor(match, 'h', 'win', true), {
    byUserId: 'h',
    result: 'white',
    homeWhite: true,
  })
  // away lost with white: black (home) won, home had black
  assert.deepEqual(reportFor(match, 'a', 'loss', true), {
    byUserId: 'a',
    result: 'black',
    homeWhite: false,
  })
  assert.equal(reportFor(match, 'a', 'draw', false).result, 'draw')
  assert.throws(() => reportFor(match, 'x', 'win', true), /two players/)
})

test('any decision settles a pending report', () => {
  const match = { homeUserId: 'h', awayUserId: 'a', dueAt: new Date() }
  for (const decision of [
    { kind: 'result', result: 'white', homeWhite: true },
    { kind: 'walkover', winnerUserId: 'h' },
    { kind: 'void' },
    { kind: 'reopen' },
  ] as const) {
    assert.equal(decisionFields(decision, match, false).report, null)
  }
})
