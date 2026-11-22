import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { yoga } from './graphql.ts'

/**
 * The Misri API (Vercel's Hono preset picks up this default export).
 * `GET /health`, and GraphQL at `/graphql`; sign in with a Bearer token.
 */
const app = new Hono()
  .use(
    cors({
      origin: '*',
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  )
  .get('/', (c) => c.json({ name: 'misri-api', graphql: '/graphql' }))
  .get('/health', (c) =>
    c.json({ ok: true, version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' }),
  )
  .on(['GET', 'POST'], '/graphql', (c) => yoga.fetch(c.req.raw))
  .notFound((c) => c.json({ error: 'Not found' }, 404))

export type AppType = typeof app
export default app
