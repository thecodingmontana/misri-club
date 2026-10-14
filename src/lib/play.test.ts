import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadGame, outcomeFor, takeBack, withReply } from './play.ts'

const play = (...moves: Array<string>) => {
  const chess = loadGame('')
  for (const move of moves) chess.move(move)
  return chess
}

test('checkmate is a win for the side that delivered it', () => {
  // Fool's mate: Black mates White.
  const mated = play('f3', 'e5', 'g4', 'Qh4#')
  assert.equal(outcomeFor(mated, 'black'), 'win')
  assert.equal(outcomeFor(mated, 'white'), 'loss')
  assert.equal(outcomeFor(play('e4'), 'white'), null)
})

test('stalemate is a draw', () => {
  const chess = loadGame('')
  chess.load('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
  assert.equal(outcomeFor(chess, 'white'), 'draw')
})

test('take back returns to the player’s turn, whichever colour they play', () => {
  const pgn = play('e4', 'e5', 'Nf3', 'Nc6').pgn()
  assert.equal(loadGame(takeBack(pgn, 'white')).history().length, 2)
  // As Black, after White's reply: undo the reply and Black's own move.
  const asBlack = play('e4', 'e5', 'Nf3').pgn()
  assert.deepEqual(loadGame(takeBack(asBlack, 'black')).history(), ['e4'])
})

test('Stockfish’s reply lands on a brand-new game, but not on a stale one', () => {
  const start = loadGame('').fen()
  // As Black, a new game is stored as '' and Stockfish opens.
  const opened = withReply('', start, 'e2e4')
  assert.ok(opened)
  assert.deepEqual(loadGame(opened).history(), ['e4'])
  // The player took back or started over while it thought.
  assert.equal(withReply(play('d4').pgn(), start, 'e2e4'), null)
})
