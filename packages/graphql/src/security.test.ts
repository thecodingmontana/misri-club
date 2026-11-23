import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSchema, createYoga } from 'graphql-yoga'
import { securityPlugins } from './security.ts'

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Node {
      n: Int
      child: Node
    }
    type Query {
      hello: String
      node: Node
    }
  `,
  resolvers: {
    Query: { hello: () => 'hi', node: () => ({}) },
    Node: { n: () => 1, child: () => ({}) },
  },
})
const server = (production: boolean) =>
  createYoga({
    schema,
    plugins: securityPlugins({ production }),
    logging: false,
  })
const prod = server(true)

const post = (query: string, yoga = prod) =>
  yoga.fetch('http://x/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
const errors = async (res: Response): Promise<string[]> =>
  ((await res.json()).errors ?? []).map((e: { message: string }) => e.message)

test('JSON POSTs pass the CSRF check (browsers preflight them)', async () => {
  const res = await post('{ hello }')
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).data, { hello: 'hi' })
})

test('a GET needs the CSRF header; with it, it works', async () => {
  const bare = await prod.fetch('http://x/graphql?query=%7Bhello%7D')
  assert.equal(bare.status, 403)
  const marked = await prod.fetch('http://x/graphql?query=%7Bhello%7D', {
    headers: { 'x-graphql-yoga-csrf': '1' },
  })
  assert.equal(marked.status, 200)
})

test('a form-encoded POST (what a cross-site form sends) is refused', async () => {
  const res = await prod.fetch('http://x/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'query=%7Bhello%7D',
  })
  assert.equal(res.status, 403)
})

test('too deep, too many aliases, too long: refused before running', async () => {
  const deep = `{ node { ${'child { '.repeat(8)}n${' }'.repeat(8)} } }`
  assert.ok((await errors(await post(deep))).some((m) => /depth/i.test(m)))
  const aliases = `{ ${Array.from({ length: 7 }, (_, i) => `a${i}: hello`).join(' ')} }`
  const many = await errors(await post(aliases))
  assert.ok(many.some((m) => /alias/i.test(m)))
  const long = `{ hello ${'node { n } '.repeat(200)} }`
  assert.ok((await errors(await post(long))).some((m) => /token/i.test(m)))
})

test('no "did you mean" hints that map the schema for a stranger', async () => {
  const [message] = await errors(await post('{ helo }'))
  assert.match(message, /Cannot query field/)
  assert.doesNotMatch(message, /Did you mean/)
})

test('introspection is off in production, on elsewhere', async () => {
  const query = '{ __schema { queryType { name } } }'
  assert.ok(
    (await errors(await post(query))).some((m) => /introspection/i.test(m)),
  )
  const dev = await post(query, server(false))
  assert.equal((await dev.json()).data.__schema.queryType.name, 'Query')
})

test('top-level fields are capped at 5, fragments included', async () => {
  const query = `query { ...F } fragment F on Query { hello node { n } a: hello b: hello c: node { n } d: node { n } }`
  assert.ok(
    (await errors(await post(query))).some((m) => /At most 5 fields/.test(m)),
  )
})
