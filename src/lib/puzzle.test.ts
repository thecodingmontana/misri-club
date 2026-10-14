import assert from 'node:assert/strict'
import { test } from 'node:test'
import { judgeMove, puzzleStart } from './puzzle.ts'

// A real Lichess puzzle (WdVsQ): White to play e5, then wins the rook.
const pgn =
  'd4 Nf6 c4 e6 Nc3 d5 cxd5 exd5 Bg5 c6 e3 Be7 Qc2 O-O Bd3 Nbd7 Nf3 Re8 h3 Ne4 Bf4 Ndf6 O-O h6 Nxe4 dxe4 Bxe4 Nxe4 Qxe4 Bd6 Ne5 f6 Qg6 fxe5 Bxh6 Qe7 Bxg7 Qf7 Qxf7+ Kxf7 Bxe5 Bxe5 dxe5 Rxe5 Rad1 Be6 a3 Rg8 Kh2 Reg5 g4 Rh8 f3 Rc5 Rf2 Ke7 Kg3 Bb3 Rd4 Bd5 h4 Be6 Rf4 Rd5 e4 Rd3 h5 c5 Kh4 Bf7 Rf5 b6 b4 cxb4 axb4 Rb3 Rc2 Be6 Rf4 Kd6 g5 Rxb4'
const solution = ['e4e5', 'd6e5', 'f4b4']

test('a puzzle is solved move by move, with the reply in between', () => {
  const start = puzzleStart(pgn)
  assert.equal(start.turn(), 'w')

  const first = judgeMove(start.fen(), solution, 0, 'e4', 'e5')
  assert.equal(first.kind, 'right')
  assert.ok(first.kind === 'right' && first.reply === 'd6e5')
})

test('a legal but different move is wrong, and so is an illegal one', () => {
  const fen = puzzleStart(pgn).fen()
  assert.equal(judgeMove(fen, solution, 0, 'f4', 'f5').kind, 'wrong')
  assert.equal(judgeMove(fen, solution, 0, 'e4', 'e6').kind, 'wrong')
})

test('the last move solves it; any mate counts; promotion follows the solution', () => {
  // Back-rank: Ra8# and Rb8# both mate.
  const mate = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
  assert.deepEqual(judgeMove(mate, ['a1a8'], 0, 'a1', 'a8'), {
    kind: 'right',
    fen: 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1',
    reply: null,
  })

  // Underpromotion to a knight with check: the solution's piece is used.
  const knight = '8/4P1k1/8/8/8/8/8/K7 w - - 0 1'
  const verdict = judgeMove(knight, ['e7e8n', 'g7f7'], 0, 'e7', 'e8')
  assert.ok(verdict.kind === 'right' && verdict.fen.startsWith('4N3'))
})
