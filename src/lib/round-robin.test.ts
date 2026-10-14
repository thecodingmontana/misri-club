import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateDoubleRoundRobin, matchdayCount } from './round-robin.ts'

test('every ordered pair meets once, nobody plays twice on a matchday', () => {
  for (let n = 2; n <= 11; n++) {
    const ids = Array.from({ length: n }, (_, i) => i + 1)
    const fixtures = generateDoubleRoundRobin(ids)
    const pairings = new Set<string>()
    const busy = new Map<number, Set<number>>()

    for (const f of fixtures) {
      const day = busy.get(f.matchday) ?? new Set<number>()
      busy.set(f.matchday, day)
      for (const id of [f.homeId, f.awayId, f.byeId]) {
        if (id === null) continue
        assert.ok(!day.has(id), `n=${n}: player ${id} twice on ${f.matchday}`)
        day.add(id)
      }
      if (f.homeId !== null && f.awayId !== null) {
        const key = `${f.homeId}>${f.awayId}`
        assert.ok(!pairings.has(key), `n=${n}: ${key} repeated`)
        pairings.add(key)
      }
    }

    assert.equal(pairings.size, n * (n - 1), `n=${n}: pairings`)
    assert.equal(busy.size, matchdayCount(n), `n=${n}: matchdays`)
    for (const day of busy.values()) assert.equal(day.size, n, `n=${n}: everyone each day`)
  }
})
