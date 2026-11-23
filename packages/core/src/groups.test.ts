import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKnockoutRound1 } from './bracket.ts'
import {
  drawGroups,
  groupName,
  groupsProblem,
  qualifierSeeds,
} from './groups.ts'

test('snake draw spreads the seeds across groups', () => {
  assert.deepEqual(drawGroups([1, 2, 3, 4, 5, 6, 7, 8], 2), [
    [1, 4, 5, 8],
    [2, 3, 6, 7],
  ])
  assert.deepEqual(drawGroups(['a', 'b', 'c', 'd', 'e'], 2), [
    ['a', 'd', 'e'],
    ['b', 'c'],
  ])
})

test('group-mates never meet in the first knockout round', () => {
  for (const groups of [2, 4, 8]) {
    const ranked = Array.from({ length: groups }, (_, g) => [
      `${groupName(g)}1`,
      `${groupName(g)}2`,
    ])
    const round1 = generateKnockoutRound1(qualifierSeeds(ranked, 2))
    for (const tie of round1) {
      assert.notEqual(
        tie.homeId?.[0],
        tie.awayId?.[0],
        `${tie.homeId} v ${tie.awayId}`,
      )
    }
  }
  const two = generateKnockoutRound1(
    qualifierSeeds(
      [
        ['A1', 'A2'],
        ['B1', 'B2'],
      ],
      2,
    ),
  )
  assert.deepEqual(
    two.map((t) => [t.homeId, t.awayId]),
    [
      ['A1', 'B2'],
      ['B1', 'A2'],
    ],
  )
})

test('settings that cannot work are explained', () => {
  assert.equal(groupsProblem(3, 2, 1), '2 groups need at least 4 players.')
  assert.equal(
    groupsProblem(4, 2, 2),
    'Each group needs more players than go through.',
  )
  assert.equal(groupsProblem(8, 2, 2), null)
})
