import { createFileRoute } from '@tanstack/react-router'
import { auth } from '#/server/auth.server'
import { sameOriginWrites } from '#/server/csrf'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    // Better Auth checks Origin only when a session cookie is sent; this
    // refuses every cross-site write, signed in or not.
    middleware: [sameOriginWrites],
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
})
