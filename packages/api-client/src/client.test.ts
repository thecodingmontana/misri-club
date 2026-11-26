import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, createApiClient } from './client.ts'

const answering = (status: number, body: unknown) =>
  createApiClient({
    url: 'https://api.test',
    fetch: async () => new Response(JSON.stringify(body), { status }),
  })

const failure = async (status: number, body: unknown) => {
  try {
    await answering(status, body).act('markInboxRead', {})
  } catch (error) {
    assert.ok(error instanceof ApiError)
    return error
  }
  assert.fail('expected an ApiError')
}

test('a message for the player is a refusal', async () => {
  const error = await failure(200, { errors: [{ message: 'It is over.' }] })
  assert.equal(error.message, 'It is over.')
  assert.equal(error.refused, true)
})

test('a masked error or a failed response is worth retrying', async () => {
  assert.equal(
    (await failure(200, { errors: [{ message: 'Unexpected error.' }] }))
      .refused,
    false,
  )
  assert.equal(
    (await failure(429, { errors: [{ message: 'Slow down.' }] })).refused,
    false,
  )
  assert.equal((await failure(502, { error: 'Bad gateway' })).refused, false)
})

test('a limit for now ("Too many tries") is kept for later, not refused', async () => {
  const error = await failure(200, {
    errors: [{ message: 'Too many tries.', extensions: { code: 'TRY_LATER' } }],
  })
  assert.equal(error.message, 'Too many tries.')
  assert.equal(error.refused, false)
})
