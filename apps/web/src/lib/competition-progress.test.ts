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
  position: 0,
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

test('knockout: pairs by bracket position, not by the order rows arrive', () => {
  const step = knockoutStep([
    m({ position: 3, homeUserId: 'g', awayUserId: 'h', winnerUserId: 'h' }),
    m({ position: 0, homeUserId: 'a', awayUserId: 'b', winnerUserId: 'a' }),
    m({ position: 2, homeUserId: 'e', awayUserId: 'f', winnerUserId: 'e' }),
    m({ position: 1, homeUserId: 'c', awayUserId: 'd', winnerUserId: 'd' }),
  ])
  assert.equal(step.kind, 'next')
  if (step.kind === 'next') {
    assert.deepEqual(
      step.matches.map((x) => [x.homeId, x.awayId]),
      [
        ['a', 'd'],
        ['e', 'h'],
      ],
    )
  }
})

test('knockout: a winner who left sends their opponent through', () => {
  const step = knockoutStep(
    [
      m({ position: 0, homeUserId: 'a', awayUserId: 'b', winnerUserId: 'a' }),
      m({ position: 1, homeUserId: 'c', awayUserId: 'd', winnerUserId: 'd' }),
    ],
    new Set(['a']),
  )
  assert.equal(step.kind, 'next')
  if (step.kind === 'next') {
    assert.deepEqual(
      step.matches.map((x) => [x.homeId, x.awayId]),
      [['b', 'd']],
    )
  }
})

test('knockout: a bye holder who left hands their neighbour a bye', () => {
  const step = knockoutStep(
    [
      m({ position: 0, homeUserId: null, awayUserId: null, byeUserId: 'a' }),
      m({ position: 1, homeUserId: 'c', awayUserId: 'd', winnerUserId: 'd' }),
      m({ position: 2, homeUserId: 'e', awayUserId: 'f', winnerUserId: 'e' }),
      m({ position: 3, homeUserId: 'g', awayUserId: 'h', winnerUserId: 'h' }),
    ],
    new Set(['a']),
  )
  assert.equal(step.kind, 'next')
  if (step.kind === 'next') {
    assert.deepEqual(step.matches[0], {
      round: 2,
      homeId: null,
      awayId: null,
      byeId: 'd',
    })
  }
})

test('knockout: the final won by a leaver crowns the opponent', () => {
  const step = knockoutStep(
    [m({ homeUserId: 'a', awayUserId: 'b', winnerUserId: 'a' })],
    new Set(['a']),
  )
  assert.deepEqual(step, { kind: 'champion', userId: 'b' })
})
