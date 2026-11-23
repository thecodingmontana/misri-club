import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchPlayerRating } from './chesscom.ts'

test('ratings are cached per member, in any casing, and failures are not', async () => {
  let calls = 0
  let fail = true
  globalThis.fetch = (async () => {
    calls++
    if (fail) return new Response('', { status: 400 })
    return Response.json({ chess_blitz: { last: { rating: 1500 } } })
  }) as typeof fetch

  await assert.rejects(fetchPlayerRating('Alice'))
  fail = false

  const [a, b] = await Promise.all([
    fetchPlayerRating('Alice'),
    fetchPlayerRating('alice'),
  ])
  assert.deepEqual(a, { username: 'Alice', rating: 1500, timeClass: 'blitz' })
  assert.equal(b.username, 'alice')
  assert.equal(calls, 2) // one failed, one shared by both callers
})
