import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, createApiClient } from '@misri/api-client'
import app from './app.ts'
import { trustedCaller } from './limits.ts'

// the shared client, talking to this app in-process
const client = createApiClient({
  url: 'http://api.test',
  fetch: (async (input: string, init?: RequestInit) =>
    app.request(input, init)) as typeof fetch,
})

test('the client: signed out, me is null and player asks you to sign in', async () => {
  assert.equal(await client.me(), null)
  await assert.rejects(client.player('anyone'), (error: Error) => {
    assert.ok(error instanceof ApiError)
    assert.match(error.message, /Sign in first/)
    return true
  })
})

test('only the right secret makes a caller trusted', () => {
  process.env.INTERNAL_API_SECRET = 'the-shared-secret'
  const headers = (value?: string) =>
    new Headers(value ? { 'x-misri-internal': value } : {})
  assert.equal(trustedCaller(headers('the-shared-secret')), true)
  assert.equal(trustedCaller(headers('the-shared-secreT')), false)
  assert.equal(trustedCaller(headers('short')), false)
  assert.equal(trustedCaller(headers()), false)
  delete process.env.INTERNAL_API_SECRET
  assert.equal(
    trustedCaller(headers('the-shared-secret')),
    false,
    'no secret set: nobody',
  )
})
