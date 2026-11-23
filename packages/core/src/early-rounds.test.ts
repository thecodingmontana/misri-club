import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type EarlyMatch, earlyRound } from './early-rounds.ts'

const DAY = 24 * 60 * 60 * 1000
const now = new Date(10 * DAY)
const members = new Set(['a', 'b', 'c', 'd'])
const m = (over: Partial<EarlyMatch>): EarlyMatch => ({
  round: 1,
  opensAt: new Date(9 * DAY),
  dueAt: new Date(11 * DAY),
  homeUserId: 'a',
  awayUserId: 'b',
  result: null,
  winnerUserId: null,
  voided: false,
  ...over,
})
const round2 = m({
  round: 2,
  opensAt: new Date(11 * DAY),
  dueAt: new Date(13 * DAY),
})

test('opens the next round once every open game is settled', () => {
  const games = [
    m({ result: 'white' }),
    m({ homeUserId: 'c', awayUserId: 'd', winnerUserId: 'c' }),
    round2,
  ]
  assert.equal(earlyRound(games, members, 'organiser', now), 2)
})

test('waits while a game is still to play', () => {
  const games = [
    m({ result: 'draw' }),
    m({ homeUserId: 'c', awayUserId: 'd' }),
    round2,
  ]
  assert.equal(earlyRound(games, members, 'organiser', now), null)
})

test('byes, called-off games and games against leavers count as settled', () => {
  const games = [
    m({ homeUserId: null, awayUserId: null }),
    m({ voided: true }),
    m({ homeUserId: 'c', awayUserId: 'gone' }),
    round2,
  ]
  assert.equal(earlyRound(games, members, 'organiser', now), 2)
})

test('an expired game waits for the organiser only under "I decide"', () => {
  const games = [m({ dueAt: new Date(9.5 * DAY) }), round2]
  assert.equal(earlyRound(games, members, 'organiser', now), null)
  assert.equal(earlyRound(games, members, 'both_forfeit', now), 2)
})

test('nothing to open after the last round', () => {
  assert.equal(
    earlyRound([m({ result: 'white' })], members, 'organiser', now),
    null,
  )
})
