import { createFileRoute } from '@tanstack/react-router'

/** The deployed build, so open tabs can tell a newer one went live. */
export const Route = createFileRoute('/api/version')({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { id: __BUILD_ID__ },
          { headers: { 'Cache-Control': 'no-store' } },
        ),
    },
  },
})
