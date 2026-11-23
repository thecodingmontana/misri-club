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

test('too many top-level fields, aliases or fragments, is refused before any read', async () => {
  const aliases = Array.from(
    { length: 6 },
    (_, i) => `c${i}: openCompetitions { slug }`,
  )
  const many = await (await gql(`{ ${aliases.join(' ')} }`)).json()
  assert.match(many.errors[0].message, /At most 5 fields/)
  assert.equal(many.data, undefined)
  const viaFragment = await (
    await gql(
      `query { ...F ...F2 } fragment F on Query { a: me { id } b: me { id } c: me { id } } fragment F2 on Query { d: me { id } e: me { id } f: me { id } }`,
    )
  ).json()
  assert.match(viaFragment.errors[0].message, /At most 5 fields/)
})

test('batched queries are refused', async () => {
  const res = await app.request('/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      { query: '{ me { id } }' },
      { query: '{ me { id } }' },
    ]),
  })
  const body = await res.json()
  assert.ok(body.errors?.length, 'an array body is an error')
})

test('a body over 16 KB gets 413', async () => {
  const res = await gql(`{ me { id } } # ${'x'.repeat(17 * 1024)}`)
  assert.equal(res.status, 413)
})

test('security headers on every response', async () => {
  const res = await app.request('/health')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.ok(res.headers.get('strict-transport-security'))
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN')
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin')
})
