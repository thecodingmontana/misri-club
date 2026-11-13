import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Chess } from 'chess.js'
import { MASTER_GAMES, plyOf } from './masters.ts'

for (const game of MASTER_GAMES) {
  test(`${game.title} replays legally and its notes land on their moves`, () => {
    const chess = new Chess()
    chess.loadPgn(game.moves)
    const history = chess.history()

    // A game shown ending in mate really is mate, for the side it says won.
    if (game.moves.trimEnd().endsWith('#')) {
      assert.ok(chess.isCheckmate(), 'the last move mates')
      assert.equal(game.result, chess.turn() === 'w' ? '0-1' : '1-0')
    }

    for (const note of game.notes) {
      const { ply, san } = plyOf(note.move)
      assert.equal(history[ply - 1], san, `note "${note.move}" is on that move`)
    }
    assert.ok(
      game.notes.some((note) => note.brilliant),
      'has a brilliant move',
    )
  })
}

test('slugs are unique', () => {
  const slugs = MASTER_GAMES.map((game) => game.slug)
  assert.equal(new Set(slugs).size, slugs.length)
})
