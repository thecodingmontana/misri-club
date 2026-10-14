import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POINTS, fitsFixture, tallyStandings } from './standings.ts'

const now = new Date('2026-10-12T12:00:00Z')
const past = new Date('2026-10-10T12:00:00Z')
const future = new Date('2026-10-14T12:00:00Z')
const fixture = (
  id: number,
  extra: Partial<{ dueAt: Date; walkoverWinnerId: number | null }> = {},
) => ({
  id,
  homePlayerId: 1,
  awayPlayerId: 2,
  dueAt: past,
  walkoverWinnerId: null,
  ...extra,
})

test('a win scores for whoever had the winning colour, home or away', () => {
  const tally = tallyStandings(
    [fixture(10)],
    [{ fixtureId: 10, whitePlayerId: 2, result: 'white' }],
    [1, 2],
    now,
  )
  assert.equal(tally.get(2)?.points, POINTS.win)
  assert.equal(tally.get(2)?.wins, 1)
  assert.equal(tally.get(1)?.losses, 1)
  assert.equal(tally.get(1)?.points, POINTS.loss)
})

test('a draw gives both players a point', () => {
  const tally = tallyStandings(
    [fixture(10)],
    [{ fixtureId: 10, whitePlayerId: 1, result: 'draw' }],
    [1, 2],
    now,
  )
  assert.equal(tally.get(1)?.points, POINTS.draw)
  assert.equal(tally.get(2)?.points, POINTS.draw)
})

test('an unplayed fixture costs both only once its window closes', () => {
  const open = tallyStandings([fixture(10, { dueAt: future })], [], [1, 2], now)
  assert.equal(open.get(1)?.points, 0)

  const closed = tallyStandings([fixture(10)], [], [1, 2], now)
  assert.equal(closed.get(1)?.points, POINTS.forfeit)
  assert.equal(closed.get(2)?.points, POINTS.forfeit)
  assert.equal(closed.get(2)?.forfeits, 1)
})

test('a walkover gives the winner 3 and the other -1, even before the deadline', () => {
  const tally = tallyStandings(
    [fixture(10, { dueAt: future, walkoverWinnerId: 2 })],
    [],
    [1, 2],
    now,
  )
  assert.deepEqual(tally.get(2), {
    points: 3,
    wins: 1,
    draws: 0,
    losses: 0,
    forfeits: 0,
  })
  assert.deepEqual(tally.get(1), {
    points: -1,
    wins: 0,
    draws: 0,
    losses: 0,
    forfeits: 1,
  })
})

test('a played game overrides a walkover', () => {
  const tally = tallyStandings(
    [fixture(10, { walkoverWinnerId: 2 })],
    [{ fixtureId: 10, whitePlayerId: 1, result: 'white' }],
    [1, 2],
    now,
  )
  assert.equal(tally.get(1)?.points, POINTS.win)
  assert.equal(tally.get(2)?.forfeits, 0)
})

test('an expired fixture against a player who left costs nobody', () => {
  const tally = tallyStandings([fixture(10)], [], [1], now)
  assert.equal(tally.get(1)?.points, 0)
  assert.equal(tally.get(1)?.forfeits, 0)
})

test('a game fits its fixture only between the same pair, inside the window', () => {
  const window = {
    homePlayerId: 1,
    awayPlayerId: 2,
    opensAt: past,
    dueAt: now,
  }
  const game = (whitePlayerId: number, blackPlayerId: number, endedAt: Date) => ({
    whitePlayerId,
    blackPlayerId,
    endedAt,
  })

  assert.ok(fitsFixture(game(1, 2, past), window), 'opening instant counts')
  assert.ok(fitsFixture(game(2, 1, now), window), 'either colour, deadline counts')
  assert.ok(!fitsFixture(game(1, 2, future), window), 'after the deadline')
  assert.ok(
    !fitsFixture(game(1, 2, new Date(past.getTime() - 1)), window),
    'before the window opens',
  )
  assert.ok(!fitsFixture(game(1, 3, now), window), 'different opponent')
})
