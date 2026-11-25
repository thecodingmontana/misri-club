import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resultPushes } from './result-pushes.ts'

const league = { name: 'Misri Rapid League', slug: 'rapid' }
const game = {
  matchId: 'm1',
  homeUserId: 'a',
  awayUserId: 'b',
  homeName: 'amina_w',
  awayName: 'b_otieno',
  whiteUserId: 'b',
}

test('the winner and the loser each hear it, with their place', () => {
  const [home, away] = resultPushes(
    [{ ...game, result: 'black' }],
    league,
    (id) => (id === 'a' ? 1 : 12),
  )
  assert.equal(home.userId, 'a')
  assert.equal(home.title, 'You beat b_otieno')
  assert.equal(home.body, "You're now 1st in Misri Rapid League.")
  assert.equal(away.title, 'You lost to amina_w')
  assert.equal(away.body, "You're now 12th in Misri Rapid League.")
  assert.equal(away.url, '/c/rapid')
  assert.equal(away.tag, 'result-m1')
})

test('a draw, and no table to place you in', () => {
  const pushes = resultPushes([{ ...game, result: 'draw' }], league)
  assert.deepEqual(
    pushes.map((p) => [p.title, p.body]),
    [
      ['You drew with b_otieno', 'Recorded in Misri Rapid League.'],
      ['You drew with amina_w', 'Recorded in Misri Rapid League.'],
    ],
  )
})
