import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type LeaverMatch, settleLeaver } from './leave.ts'

const m = (
  id: string,
  home: string,
  away: string,
  played: Partial<LeaverMatch> = {},
): LeaverMatch => ({
  id,
  homeUserId: home,
  awayUserId: away,
  result: null,
  winnerUserId: null,
  ...played,
})

const games = [
  m('played', 'x', 'a', { result: 'white' }),
  m('walkover', 'b', 'x', { winnerUserId: 'b' }),
  m('next1', 'x', 'c'),
  m('next2', 'd', 'x'),
  m('others', 'a', 'b'),
]

test('award: every unplayed game of the leaver goes to the opponent', () => {
  const s = settleLeaver(games, 'x', 'award', 'league')
  assert.deepEqual(s.award, [
    { matchId: 'next1', winnerUserId: 'c' },
    { matchId: 'next2', winnerUserId: 'd' },
  ])
  assert.deepEqual(s.remove, [])
})

test('void: all their games go, played ones too, and nobody else’s', () => {
  const s = settleLeaver(games, 'x', 'void', 'league')
  assert.deepEqual(s.remove, ['played', 'walkover', 'next1', 'next2'])
  assert.deepEqual(s.award, [])
})

test('keep: nothing changes; unplayed games just never count', () => {
  assert.deepEqual(settleLeaver(games, 'x', 'keep', 'league'), {
    award: [],
    remove: [],
  })
})

test('knockout: the opponent always goes through, whatever the league rule', () => {
  const s = settleLeaver([m('tie', 'x', 'y')], 'x', 'void', 'knockout')
  assert.deepEqual(s.award, [{ matchId: 'tie', winnerUserId: 'y' }])
  assert.deepEqual(s.remove, [])
})

test('a game with no opponent yet awards nothing', () => {
  const lonely = { ...m('bye', 'x', 'z'), awayUserId: null }
  assert.deepEqual(settleLeaver([lonely], 'x', 'award', 'league').award, [])
})
