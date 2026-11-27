import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Score } from './analysis.ts'
import { gameReport } from './report.ts'

test('report: every costly move with the better one, and accuracy by phase', () => {
  const pgn = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#'
  const even: Score = { cp: 30 }
  const scores: Score[] = [
    even,
    even,
    even,
    even,
    even,
    { cp: 30, best: 'g7g6' }, // before 3...Nf6, Stockfish wanted ...g6
    { mate: 1 },
    { mate: 1 }, // mated: the engine scores it as White's mate
  ]
  const report = gameReport(pgn, 'black', scores)
  assert.equal(report.counts.blunder, 1)
  assert.deepEqual(
    report.improvements.map((i) => [i.moveNumber, i.played, i.best, i.kind]),
    [[3, 'Nf6', 'g6', 'blunder']],
  )
  assert.deepEqual(
    report.phases.map((p) => [p.phase, p.moves]),
    [['opening', 3]],
  )
  assert.ok(report.accuracy < 75, 'one blunder in three moves costs a lot')
  assert.equal(gameReport(pgn, 'white', scores).improvements.length, 0)
})
