import { timingSafeEqual } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { remindDeadlines } from '#/server/notifications.server'

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; nothing else may run this. */
function authorised(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const wanted = Buffer.from(`Bearer ${secret}`)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

export const Route = createFileRoute('/api/cron/deadlines')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorised(request)) {
          return new Response('Unauthorized', { status: 401 })
        }
        const reminded = await remindDeadlines()
        return Response.json({ reminded })
      },
    },
  },
})
