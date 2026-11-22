import { createFileRoute } from '@tanstack/react-router'
import { api } from '#/server/api.server'

const toHono = ({ request }: { request: Request }) => api.fetch(request)

/** Everything under /api without its own route goes to the Hono app. */
export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: toHono,
      POST: toHono,
      PUT: toHono,
      PATCH: toHono,
      DELETE: toHono,
      OPTIONS: toHono,
    },
  },
})
