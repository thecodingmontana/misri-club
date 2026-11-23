import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reminderPushes } from './reminders.ts'

test('each player of a due match is reminded once, about their opponent', () => {
  const pushes = reminderPushes([
    {
      matchId: 'm1',
      homeUserId: 'a',
      awayUserId: 'b',
      homeName: 'alice',
      awayName: 'bob',
      competition: 'Friday League',
      slug: 'friday-league',
    },
  ])
  assert.equal(pushes.length, 2)
  assert.deepEqual(
    pushes.map((p) => [p.userId, p.body]),
    [
      ['a', 'Play bob on chess.com before the deadline.'],
      ['b', 'Play alice on chess.com before the deadline.'],
    ],
  )
  assert.ok(pushes.every((p) => p.url === '/c/friday-league'))
  // same tag per match, so a repeat replaces instead of stacking
  assert.ok(pushes.every((p) => p.tag === 'due-m1'))
})

test('no due matches, no pushes', () => {
  assert.deepEqual(reminderPushes([]), [])
})
