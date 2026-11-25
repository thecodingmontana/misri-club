import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boardSvg } from './board-svg.ts'

test('the board draws 64 squares and every piece, in place', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const svg = boardSvg(start, 'white')
  assert.equal(svg.match(/<rect /g)?.length, 64)
  assert.equal(svg.match(/<svg /g)?.length, 1 + 32)
  assert.ok(!svg.includes('100%'))
  // white's king on e1: file 4, rank 8 from the top
  assert.ok(svg.includes('x="180" y="315"'))
  // seen from black, the same king sits top right of centre
  assert.ok(boardSvg(start, 'black').includes('x="135" y="0"'))
})
