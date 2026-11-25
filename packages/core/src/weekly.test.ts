import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type WeekMatch, weeklySummary } from './weekly.ts'

const now = new Date('2026-11-30T07:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 86_400_000)
const game = (over: Partial<WeekMatch>): WeekMatch => ({
  homeUserId: 'a',
  awayUserId: 'b',
  whiteUserId: 'a',
  result: null,
  winnerUserId: null,
  voided: false,
  endedAt: null,
  dueAt: days(3),
  ...over,
})
const league = { name: 'Misri League', slug: 'league' }

test('a week with results, a place and games due', () => {
  const games = [
    game({ result: 'white', endedAt: days(-2) }), // a won as white
    game({
      result: 'draw',
      endedAt: days(-5),
      homeUserId: 'c',
      awayUserId: 'a',
      whiteUserId: 'c',
    }),
    game({ result: 'white', endedAt: days(-20) }), // too old
    game({ dueAt: days(2) }),
    game({ dueAt: days(12) }), // not this week
    game({ dueAt: days(1), voided: true }),
  ]
  assert.deepEqual(weeklySummary(league, games, 'a', 2, now), {
    userId: 'a',
    title: 'Your week in Misri League',
    body: "Last week: 1 win, 1 draw. You're 2nd. 1 game due this week.",
    url: '/c/league',
    tag: 'weekly-league',
  })
  // the same first game, from b's side: a loss
  assert.equal(
    weeklySummary(league, games.slice(0, 1), 'b', null, now)?.body,
    'Last week: 1 loss.',
  )
})

test('nothing played and nothing due: no push', () => {
  assert.equal(
    weeklySummary(league, [game({ dueAt: days(30) })], 'a', 1, now),
    null,
  )
  assert.equal(weeklySummary(league, [], 'a', 1, now), null)
})
