import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fitsMatch,
  POINTS,
  type ScoredMatch,
  tallyStandings,
} from './standings.ts'

const now = new Date('2026-10-12T12:00:00Z')
const past = new Date('2026-10-10T12:00:00Z')
const future = new Date('2026-10-14T12:00:00Z')
const match = (extra: Partial<ScoredMatch> = {}): ScoredMatch => ({
  homeUserId: 'a',
  awayUserId: 'b',
  dueAt: past,
  result: null,
  whiteUserId: null,
  winnerUserId: null,
  ...extra,
})

test('a win scores for whoever had the winning colour, home or away', () => {
  const tally = tallyStandings(
    [match({ whiteUserId: 'b', result: 'white' })],
    ['a', 'b'],
    now,
  )
  assert.equal(tally.get('b')?.points, POINTS.win)
  assert.equal(tally.get('b')?.wins, 1)
  assert.equal(tally.get('a')?.losses, 1)
  assert.equal(tally.get('a')?.points, POINTS.loss)
})

test('a draw gives both players a point', () => {
  const tally = tallyStandings(
    [match({ whiteUserId: 'a', result: 'draw' })],
    ['a', 'b'],
    now,
  )
  assert.equal(tally.get('a')?.points, POINTS.draw)
  assert.equal(tally.get('b')?.points, POINTS.draw)
})

test('an unplayed match costs both only once its window closes', () => {
  const open = tallyStandings([match({ dueAt: future })], ['a', 'b'], now)
  assert.equal(open.get('a')?.points, 0)

  const closed = tallyStandings([match()], ['a', 'b'], now)
  assert.equal(closed.get('a')?.points, POINTS.forfeit)
  assert.equal(closed.get('b')?.points, POINTS.forfeit)
  assert.equal(closed.get('b')?.forfeits, 1)
})

test('a walkover gives the winner 3 and the other -1, even before the deadline', () => {
  const tally = tallyStandings(
    [match({ dueAt: future, winnerUserId: 'b' })],
    ['a', 'b'],
    now,
  )
  assert.deepEqual(tally.get('b'), {
    points: 3,
    wins: 1,
    draws: 0,
    losses: 0,
    forfeits: 0,
  })
  assert.deepEqual(tally.get('a'), {
    points: -1,
    wins: 0,
    draws: 0,
    losses: 0,
    forfeits: 1,
  })
})

test('a played game overrides a walkover', () => {
  const tally = tallyStandings(
    [match({ winnerUserId: 'b', whiteUserId: 'a', result: 'white' })],
    ['a', 'b'],
    now,
  )
  assert.equal(tally.get('a')?.points, POINTS.win)
  assert.equal(tally.get('b')?.forfeits, 0)
})

test('an expired match against a player who left costs nobody', () => {
  const tally = tallyStandings([match()], ['a'], now)
  assert.equal(tally.get('a')?.points, 0)
  assert.equal(tally.get('a')?.forfeits, 0)
})

test('byes score nothing', () => {
  const tally = tallyStandings(
    [match({ homeUserId: null, awayUserId: null })],
    ['a', 'b'],
    now,
  )
  assert.equal(tally.get('a')?.points, 0)
  assert.equal(tally.get('b')?.points, 0)
})

test('a game fits its match only between the same pair, inside the window', () => {
  const window = { homeUserId: 'a', awayUserId: 'b', opensAt: past, dueAt: now }
  const game = (whiteUserId: string, blackUserId: string, endedAt: Date) => ({
    whiteUserId,
    blackUserId,
    endedAt,
  })

  assert.ok(fitsMatch(game('a', 'b', past), window), 'opening instant counts')
  assert.ok(
    fitsMatch(game('b', 'a', now), window),
    'either colour, deadline counts',
  )
  assert.ok(!fitsMatch(game('a', 'b', future), window), 'after the deadline')
  assert.ok(
    !fitsMatch(game('a', 'b', new Date(past.getTime() - 1)), window),
    'before the window opens',
  )
  assert.ok(!fitsMatch(game('a', 'c', now), window), 'different opponent')
})
