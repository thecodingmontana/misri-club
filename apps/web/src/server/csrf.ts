import { createMiddleware } from '@tanstack/react-start'
import { crossSite, SAFE_METHODS } from '#/lib/same-origin'

/**
 * CSRF guard for server routes, through their `server.middleware`: a request
 * that can change data must come from this site, while reads (like Google's
 * cross-site sign-in redirect) pass. Server functions use TanStack's own
 * guard, set up in src/start.ts.
 */
export const sameOriginWrites = createMiddleware().server(
  ({ next, request }) => {
    if (!SAFE_METHODS.has(request.method) && crossSite(request)) {
      throw new Response("Cross-site requests aren't allowed", { status: 403 })
    }
    return next()
  },
)
