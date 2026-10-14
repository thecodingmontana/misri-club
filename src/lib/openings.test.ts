import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Chess } from 'chess.js'
import { deepestNamed, OPENINGS, parseOpenings, sanOf } from './openings.ts'

const lines = parseOpenings(
  readFileSync(new URL('../../public/openings.tsv', import.meta.url), 'utf8'),
)

// Lichess's own repository checks every line is legal; here, that it reads.
test('the bundled Lichess data set reads', () => {
  assert.ok(lines.length > 3000)
  assert.ok(lines[0].moves.length > 0)
})

for (const course of OPENINGS) {
  test(`${course.slug}: legal, named as Lichess names it, a reason per move`, () => {
    const moves = sanOf(course.moves)
    const chess = new Chess()
    for (const san of moves) chess.move(san)

    const named = deepestNamed(lines, moves)
    assert.equal(named?.name, course.name)
    assert.equal(named?.eco, course.eco)
    assert.equal(course.why.length, moves.length)
    assert.ok(course.plans.length > 0)
  })
}

test('course slugs are unique', () => {
  const slugs = OPENINGS.map((course) => course.slug)
  assert.equal(new Set(slugs).size, slugs.length)
})
