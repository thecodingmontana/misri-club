import { createMiddleware } from '@tanstack/react-start'
import { crossSite, SAFE_METHODS } from '#/lib/same-origin'

/**
 * CSRF guard: a request that can change data must come from this site. Runs
 * globally from src/start.ts, and on server routes (which global request
 * middleware does not reach) through their `server.middleware`.
 */
export const sameOriginWrites = createMiddleware().server(
  ({ next, request }) => {
    if (!SAFE_METHODS.has(request.method) && crossSite(request)) {
      throw new Response("Cross-site requests aren't allowed", { status: 403 })
    }
    return next()
  },
)
