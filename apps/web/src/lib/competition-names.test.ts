import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeName,
  suggestFrom,
  suggestNames,
} from './competition-names.ts'

test('normalizeName trims, collapses whitespace and lower-cases', () => {
  assert.equal(normalizeName('  Summer   Cup\t'), 'summer cup')
})

test('suggestNames returns distinct names', () => {
  const names = suggestNames(20, new Set(), 1)
  assert.equal(names.length, 20)
  assert.equal(new Set(names.map(normalizeName)).size, 20)
})

test('suggestNames never returns a taken name', () => {
  const first = suggestNames(10, new Set(), 7)
  const taken = new Set(first.map(normalizeName))
  for (const name of suggestNames(10, taken, 7)) {
    assert.ok(!taken.has(normalizeName(name)))
  }
})

test('suggestNames is deterministic with a seed', () => {
  assert.deepEqual(
    suggestNames(5, new Set(), 42),
    suggestNames(5, new Set(), 42),
  )
})

test('suggestFrom builds on the typed name and skips taken ones', () => {
  const taken = new Set(['summer cup'])
  const names = suggestFrom('Summer Cup', 3, taken, 3)
  assert.equal(names.length, 3)
  for (const name of names) {
    assert.match(name, /^Summer \w+ Cup$/)
    assert.ok(!taken.has(normalizeName(name)))
  }
})

test('suggestFrom adds a type when the name has none', () => {
  const [first] = suggestFrom('Friday Rooks', 1, new Set(), 1)
  assert.equal(first, 'Friday Rooks Cup')
})
