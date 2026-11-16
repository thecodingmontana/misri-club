import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type ChallengeGame,
  challengeOutcome,
  challengeScore,
} from './challenge.ts'

const open: ChallengeGame = {
  result: null,
  whiteUserId: null,
  winnerUserId: null,
  voided: false,
}
const win = (white: string, whiteWins = true): ChallengeGame => ({
  ...open,
  result: whiteWins ? 'white' : 'black',
  whiteUserId: white,
})
const draw: ChallengeGame = { ...open, result: 'draw', whiteUserId: 'a' }

test('score: wins, losses as black, draws and walkovers', () => {
  const games = [
    win('a'),
    win('a', false),
    draw,
    { ...open, winnerUserId: 'a' },
    open,
  ]
  assert.deepEqual(challengeScore(games, 'a', 'b'), { a: 2.5, b: 1.5, open: 1 })
})

test('best of 3: two wins clinch it, the last game is not needed', () => {
  assert.deepEqual(
    challengeOutcome([win('a'), win('b', false), open], 'a', 'b'),
    {
      kind: 'won',
      userId: 'a',
    },
  )
})

test('still going while the trailing player can catch up', () => {
  assert.deepEqual(challengeOutcome([win('a'), open, open], 'a', 'b'), {
    kind: 'going',
  })
})

test('level after every game is a drawn match; called-off games do not count', () => {
  assert.deepEqual(
    challengeOutcome([win('a'), win('b'), { ...open, voided: true }], 'a', 'b'),
    {
      kind: 'drawn',
    },
  )
  assert.deepEqual(challengeOutcome([draw], 'a', 'b'), { kind: 'drawn' })
})
