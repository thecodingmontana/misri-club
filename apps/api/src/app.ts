import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { yoga } from './graphql.ts'
import { MAX_BODY_BYTES, rateLimit } from './limits.ts'

/**
 * The Misri API (bundled to index.js for Vercel's Hono preset).
 * `GET /health`, and GraphQL at `/graphql`; sign in with a Bearer token.
 */
const app = new Hono()
  .use(secureHeaders())
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
  .use(
    '/graphql',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'Request too large' }, 413),
    }),
    rateLimit,
  )
  .on(['GET', 'POST'], '/graphql', (c) => yoga.fetch(c.req.raw))
  .notFound((c) => c.json({ error: 'Not found' }, 404))

export type AppType = typeof app
export default app
