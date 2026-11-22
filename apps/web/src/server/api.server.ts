import { Hono } from 'hono'
import { crossSite } from '#/lib/same-origin'
import { yoga } from './graphql.server'

/**
 * The HTTP API other apps (mobile, desktop) use, mounted at /api/* by the web
 * app's catch-all route. Auth, cron, version and calendar keep their own
 * routes; everything else under /api lands here. Import `AppType` for a typed
 * client: `hc<AppType>(origin)` from `hono/client`.
 */
export const api = new Hono()
  .basePath('/api')
  // the session cookie rides along with any browser request: refuse other sites
  .use(async (c, next) => {
    if (crossSite(c.req.raw))
      return c.text('Cross-site requests are refused.', 403)
    await next()
  })
  .on(['GET', 'POST'], '/graphql', (c) => yoga.fetch(c.req.raw))
  .notFound((c) => c.json({ error: 'Not found' }, 404))

export type AppType = typeof api
