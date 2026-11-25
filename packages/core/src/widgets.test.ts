import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextGame, ordinal, standing, timeLeft } from './widgets.ts'

const player = (id: string) => ({
  id,
  name: id.toUpperCase(),
  image: null,
  chessUsername: id === 'b' ? 'b_chess' : null,
})
const match = (home: string, away: string, status: string, dueAt: number) =>
  ({ home: player(home), away: player(away), status, dueAt }) as never
const row = (id: string, points: number) =>
  ({ player: player(id), points }) as never

const pages = [
  {
    competition: { name: 'League', slug: 'league', status: 'running' },
    matches: [match('a', 'b', 'live', 500), match('c', 'a', 'played', 100)],
    standings: [row('c', 6), row('a', 4), row('b', 1)],
  },
  {
    competition: { name: 'Cup', slug: 'cup', status: 'running' },
    matches: [match('d', 'a', 'live', 300), match('d', 'e', 'live', 50)],
    standings: [row('a', 3), row('d', 0)],
  },
]

test('the next game is your live game with the nearest deadline', () => {
  assert.deepEqual(nextGame(pages, 'a'), {
    opponent: 'D',
    competition: 'Cup',
    slug: 'cup',
    dueAt: 300,
  })
  assert.equal(nextGame(pages, 'b')?.opponent, 'A')
  assert.equal(nextGame(pages, 'z'), null)
})

test('the standing follows the next game unless a competition is picked', () => {
  assert.deepEqual(standing(pages, 'a'), {
    competition: 'Cup',
    slug: 'cup',
    place: 1,
    of: 2,
    points: 3,
  })
  assert.equal(standing(pages, 'a', 'league')?.place, 2)
  assert.equal(standing(pages, 'z'), null)
})

test('deadlines and places read naturally', () => {
  const now = 0
  assert.equal(timeLeft(now + 26 * 3600_000, now), '1d 2h left')
  assert.equal(timeLeft(now + 3 * 3600_000 + 60_000, now), '3h left')
  assert.equal(timeLeft(now + 40 * 60_000, now), '40m left')
  assert.equal(timeLeft(now - 1, now), 'Deadline passed')
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), [
    '1st',
    '2nd',
    '3rd',
    '4th',
    '11th',
    '12th',
    '13th',
    '21st',
    '22nd',
    '101st',
  ])
})
