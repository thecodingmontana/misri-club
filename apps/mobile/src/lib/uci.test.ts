import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Engine } from './uci.ts'

test('commands wait for the page, and scores come back from White’s side', async () => {
  const sent: string[] = []
  let engine: Engine
  engine = new Engine((command) => {
    sent.push(command)
    if (command === 'isready') engine.receive('readyok')
    // a black-to-move search: the engine says +50 for Black, then its move
    if (command.startsWith('go')) {
      engine.receive('info depth 10 score cp 50 pv e7e5')
      engine.receive('bestmove e7e5')
    }
  })
  const search = engine.evaluate(
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    100,
  )
  assert.deepEqual(sent, [], 'nothing sent before the page says it loaded')
  engine.receive('loaded')
  assert.deepEqual(await search, { cp: -50, best: 'e7e5' })
  assert.deepEqual(sent.slice(0, 2), ['uci', 'isready'])
  engine.terminate()
})

test('a page that fails to load fails the search instead of hanging', async () => {
  const engine = new Engine(() => {})
  const search = engine.evaluate('8/8/8/8/8/8/8/K6k w - - 0 1', 100)
  engine.receive('error The chess engine failed to load.')
  await assert.rejects(search, /failed to load/)
  engine.terminate()
})

test('a page that loads but whose engine never answers still times out', async () => {
  const engine = new Engine(() => {}, 30)
  const search = engine.evaluate('8/8/8/8/8/8/8/K6k w - - 0 1', 100)
  engine.receive('loaded')
  await assert.rejects(search, /did not load/)
  engine.terminate()
})
