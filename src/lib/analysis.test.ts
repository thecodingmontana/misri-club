import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classify,
  phaseOf,
  positionsOf,
  reviewFor,
  weakPoints,
  winChance,
} from './analysis.ts'

test('positions include the start and every move', () => {
  const { fens, sans } = positionsOf('1. e4 e5 2. Nf3 Nc6 *')
  assert.equal(fens.length, 5)
  assert.deepEqual(sans, ['e4', 'e5', 'Nf3', 'Nc6'])
  assert.match(fens[0], /^rnbqkbnr\/pppppppp/)
})

test('win chance is 50 at equality and symmetric', () => {
  assert.equal(winChance({ cp: 0 }), 50)
  assert.ok(
    Math.abs(winChance({ cp: 300 }) + winChance({ cp: -300 }) - 100) < 1e-9,
  )
  assert.equal(winChance({ mate: 3 }), 100)
  assert.equal(winChance({ mate: -2 }), 0)
})

test('a move that throws away a won position is a blunder for the mover only', () => {
  const positions = positionsOf('1. e4 e5 *')
  // White's e4 keeps equality; Black's e5 drops from equal to lost.
  const scores = [{ cp: 0 }, { cp: 0 }, { cp: 900 }]
  const black = reviewFor('black', positions, scores)
  const white = reviewFor('white', positions, scores)

  assert.equal(black.moves[0].kind, 'blunder')
  assert.equal(white.moves[0].kind, 'good')
  assert.ok(white.accuracy > 99)
  assert.ok(black.accuracy < 20)
  assert.equal(weakPoints([black]).blunders, 1)
  assert.equal(weakPoints([black]).weakestPhase?.phase, 'opening')
})

test('thresholds and phases', () => {
  assert.equal(classify(9.9), 'good')
  assert.equal(classify(10), 'inaccuracy')
  assert.equal(classify(20), 'mistake')
  assert.equal(classify(30), 'blunder')
  assert.equal(phaseOf('4k3/8/8/8/8/8/8/R3K3 w - - 0 40', 60), 'endgame')
  assert.equal(
    phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 0),
    'opening',
  )
})
