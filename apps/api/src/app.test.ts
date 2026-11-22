import assert from 'node:assert/strict'
import { test } from 'node:test'
import app from './app.ts'

const gql = (query: string, headers: Record<string, string> = {}) =>
  app.request('/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query }),
  })

test('health answers without the database', async () => {
  const res = await app.request('/health')
  assert.equal(res.status, 200)
  assert.equal((await res.json()).ok, true)
})

test('unknown paths are a JSON 404', async () => {
  const res = await app.request('/nope')
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: 'Not found' })
})

test('signed out: me is null, myCompetitions asks you to sign in', async () => {
  const me = await (await gql('{ me { id } }')).json()
  assert.deepEqual(me.data, { me: null })
  const mine = await (await gql('{ myCompetitions { slug } }')).json()
  assert.match(mine.errors[0].message, /Sign in first/)
})

test('any origin may call it (bearer tokens, no cookies)', async () => {
  const res = await app.request('/graphql', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://example.com',
      'access-control-request-method': 'POST',
    },
  })
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
})
