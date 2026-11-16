import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bracketLayout, roundName } from './bracket-layout.ts'

const tie = (round: number, position: number, dueAt = 100) => ({
  round,
  position,
  dueAt,
})

test('eight players: three rounds to the final, numbered across the bracket', () => {
  const layout = bracketLayout([0, 1, 2, 3].map((p) => tie(1, p)))
  assert.deepEqual(
    layout.map((r) => [r.name, r.slots.length]),
    [
      ['Quarter-finals', 4],
      ['Semi-finals', 2],
      ['Final', 1],
    ],
  )
  assert.deepEqual(
    layout.flatMap((r) => r.slots.map((s) => s.number)),
    [1, 2, 3, 4, 5, 6, 7],
  )
})

test('later ties wait on the two before them; unplayed rounds are placeholders', () => {
  const layout = bracketLayout([0, 1, 2, 3].map((p) => tie(1, p)))
  assert.deepEqual(layout[1].slots[1].feeds, [3, 4])
  assert.deepEqual(layout[2].slots[0].feeds, [5, 6])
  assert.equal(layout[1].slots[0].match, null)
  assert.equal(layout[1].dueAt, null)
})

test('existing ties land in their own slot, whatever order they come in', () => {
  const second = tie(2, 1, 300)
  const layout = bracketLayout([
    tie(1, 3),
    tie(1, 1),
    tie(1, 0, 200),
    tie(1, 2),
    second,
  ])
  assert.equal(layout[1].slots[1].match, second)
  assert.equal(layout[1].slots[0].match, null)
  assert.equal(layout[0].dueAt, 200)
})

test('names by ties left; nothing drawn before the start', () => {
  assert.equal(roundName(8), 'Round of 16')
  assert.deepEqual(bracketLayout([]), [])
})

test('rounds from before positions existed still show every tie', () => {
  const legacy = [0, 1, 2, 3].map(() => tie(1, 0))
  const layout = bracketLayout(legacy)
  assert.equal(layout[0].slots.filter((slot) => slot.match).length, 4)
})
