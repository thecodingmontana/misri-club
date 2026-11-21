import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type ArchiveGame, latestGames, openingName } from './my-games.ts'

const game = (over: Partial<ArchiveGame>): ArchiveGame => ({
  url: 'https://www.chess.com/game/live/1',
  end_time: 1_700_000_000,
  rules: 'chess',
  time_class: 'blitz',
  pgn: '1. e4 e5',
  white: { username: 'Alice', result: 'win', rating: 1500 },
  black: { username: 'bob', result: 'resigned', rating: 1400 },
  ...over,
})

test('reads the game from the player’s side, any case', () => {
  const [mine] = latestGames([game({})], 'BOB', 5)
  assert.equal(mine.colour, 'black')
  assert.equal(mine.outcome, 'loss')
  assert.equal(mine.opponent, 'Alice')
  assert.equal(mine.opponentRating, 1500)
  assert.equal(mine.label, 'blitz')
})

test('draw codes count as draws', () => {
  const g = game({
    white: { username: 'alice', result: 'repetition' },
    black: { username: 'bob', result: 'repetition' },
  })
  assert.equal(latestGames([g], 'alice', 5)[0].outcome, 'draw')
})

test('skips variants, missing PGNs and other people’s games', () => {
  const games = [
    game({ rules: 'chess960' }),
    game({ pgn: undefined }),
    game({ white: { username: 'carol', result: 'win' } }),
  ]
  assert.deepEqual(latestGames(games, 'alice', 5), [])
})

test('newest first, capped at count', () => {
  const games = [1, 3, 2].map((n) => game({ url: `g${n}`, end_time: n }))
  assert.deepEqual(
    latestGames(games, 'alice', 2).map((g) => g.chessComUrl),
    ['g3', 'g2'],
  )
})

test('opening name from the eco URL', () => {
  assert.equal(
    openingName('https://www.chess.com/openings/Queens-Pawn-Opening-2.Bf4'),
    'Queens Pawn Opening',
  )
  assert.equal(openingName(undefined), null)
})
