import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  knockoutStep,
  leagueComplete,
  type ProgressMatch,
} from './competition-progress.ts'

const now = new Date('2026-11-15T12:00:00Z')
const past = new Date('2026-11-14T12:00:00Z')
const future = new Date('2026-11-16T12:00:00Z')
const m = (over: Partial<ProgressMatch>): ProgressMatch => ({
  round: 1,
  homeUserId: 'a',
  awayUserId: 'b',
  byeUserId: null,
  result: null,
  winnerUserId: null,
  voided: false,
  dueAt: future,
  ...over,
})
const members = new Set(['a', 'b', 'c', 'd'])

test('league: complete once every pairing is played, awarded or called off', () => {
  const games = [
    m({ result: 'white' }),
    m({ homeUserId: 'c', winnerUserId: 'c' }),
    m({ homeUserId: 'd', voided: true }),
  ]
  assert.equal(leagueComplete(games, members, 'organiser', now), true)
})

test('league: an open game keeps it going', () => {
  assert.equal(
    leagueComplete([m({ result: 'draw' }), m({})], members, 'void', now),
    false,
  )
})

test('league: an expired game waits for the organiser under "I decide"', () => {
  const games = [m({ result: 'draw' }), m({ dueAt: past })]
  assert.equal(leagueComplete(games, members, 'organiser', now), false)
  assert.equal(leagueComplete(games, members, 'both_forfeit', now), true)
  assert.equal(leagueComplete(games, members, 'void', now), true)
})

test('league: games against someone who left never hold it up', () => {
  const games = [m({ result: 'white' }), m({ awayUserId: 'gone' })]
  assert.equal(leagueComplete(games, members, 'organiser', now), true)
})

test('knockout: waits until every tie in the round has a winner', () => {
  assert.deepEqual(
    knockoutStep([
      m({ winnerUserId: 'a' }),
      m({ homeUserId: 'c', awayUserId: 'd' }),
    ]),
    { kind: 'waiting' },
  )
})

test('knockout: winners and byes go into the next round', () => {
  const step = knockoutStep([
    m({ winnerUserId: 'b' }),
    m({ homeUserId: null, awayUserId: null, byeUserId: 'c' }),
  ])
  assert.equal(step.kind, 'next')
  if (step.kind === 'next') {
    assert.deepEqual(step.matches, [
      { round: 2, homeId: 'b', awayId: 'c', byeId: null },
    ])
  }
})

test('knockout: the final’s winner is the champion', () => {
  const step = knockoutStep([
    m({ winnerUserId: 'a' }),
    m({ homeUserId: 'c', awayUserId: 'd', winnerUserId: 'd' }),
    m({ round: 2, homeUserId: 'a', awayUserId: 'd', winnerUserId: 'd' }),
  ])
  assert.deepEqual(step, { kind: 'champion', userId: 'd' })
})
