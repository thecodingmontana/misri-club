import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildLesson, hangingSquares, mistakePuzzles } from './lesson.ts'

test('a queen walked into a capture is a hanging-piece lesson', () => {
  // 1. e4 e5 2. Nf3 Qh4?? — the knight takes the queen.
  const lesson = buildLesson({
    pgn: '1. e4 e5 2. Nf3 Qh4 *',
    colour: 'black',
    opponent: 'someone',
    outcome: 'loss',
    scores: [
      { cp: 20, best: 'e2e4' },
      { cp: 20, best: 'e7e5' },
      { cp: 30, best: 'g1f3' },
      { cp: 30, best: 'b8c6' },
      { cp: 900, best: 'f3h4' },
    ],
  })
  assert.equal(lesson.pattern, 'hung-piece')
  assert.equal(lesson.moments.length, 1)
  assert.equal(lesson.moments[0].played.san, 'Qh4')
  assert.equal(lesson.moments[0].best?.san, 'Nc6')
  assert.match(lesson.moments[0].heading, /Queen Hanging/)
  // The find-the-move question has the engine's move as its answer.
  const q = lesson.quiz[0]
  assert.equal(q.options[q.answer], 'Nc6')
  assert.ok(q.options.includes('Qh4'))
})

test('not playing an available mate is a missed-mate lesson', () => {
  // 1. f3 e5 2. g4 — Black has Qh4# but plays Nc6.
  const lesson = buildLesson({
    pgn: '1. f3 e5 2. g4 Nc6 *',
    colour: 'black',
    opponent: 'someone',
    outcome: 'draw',
    scores: [
      { cp: 0, best: 'e2e4' },
      { cp: -60, best: 'e7e5' },
      { cp: -80, best: 'b1c3' },
      { mate: -1, best: 'd8h4' },
      { cp: -60, best: 'b1c3' },
    ],
  })
  assert.equal(lesson.pattern, 'missed-mate')
  assert.equal(lesson.moments[0].best?.san, 'Qh4#')
})

test('a game with no real mistakes gets the clean-game lesson', () => {
  const lesson = buildLesson({
    pgn: '1. e4 e5 *',
    colour: 'white',
    opponent: 'someone',
    outcome: 'win',
    scores: [{ cp: 20, best: 'e2e4' }, { cp: 25 }, { cp: 25 }],
  })
  assert.equal(lesson.pattern, null)
  assert.equal(lesson.moments.length, 0)
  assert.equal(lesson.title, 'A Clean Game')
})

test('hanging pieces are attacked and undefended, kings excluded', () => {
  // White knight on e5 attacked by the d6 pawn, nothing defends it.
  const squares = hangingSquares('4k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1')
  assert.deepEqual(squares, ['e5'])
})

test("your blunders become one-move puzzles with Stockfish's move as the answer", () => {
  // 1. e4 e5 2. Nf3 Qh4?? — Black's blunder; Nc6 was the move.
  const game = {
    chessComUrl: 'https://www.chess.com/game/live/1',
    pgn: '1. e4 e5 2. Nf3 Qh4 *',
    colour: 'black' as const,
    opponent: 'someone',
  }
  const scores = [
    { cp: 20, best: 'e2e4' },
    { cp: 20, best: 'e7e5' },
    { cp: 30, best: 'g1f3' },
    { cp: 30, best: 'b8c6' },
    { cp: 900, best: 'f3h4' },
  ]
  const [puzzle, ...rest] = mistakePuzzles(game, scores)
  assert.equal(rest.length, 0)
  assert.equal(puzzle.solution, 'b8c6')
  assert.equal(puzzle.colour, 'black')
  assert.equal(puzzle.moveNumber, 2)
  assert.deepEqual(puzzle.lastMove, { from: 'g1', to: 'f3' })
  assert.equal(puzzle.id, `${game.chessComUrl}#3`)
  // White made no mistakes in the same game
  assert.deepEqual(mistakePuzzles({ ...game, colour: 'white' }, scores), [])
})
