import { timingSafeEqual } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { competitions } from '#/db/schema'
import { remindDeadlines } from '#/server/notifications.server'
import { syncResults } from '#/server/results.server'

const SYNC_BATCH = 5

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
        // results first, so a game already played gets no reminder
        const running = await db
          .select({ id: competitions.id })
          .from(competitions)
          .where(eq(competitions.status, 'running'))
        // a few at a time: chess.com calls queue anyway, the database stays calm
        for (let i = 0; i < running.length; i += SYNC_BATCH) {
          await Promise.all(
            running
              .slice(i, i + SYNC_BATCH)
              .map(({ id }) =>
                syncResults(id).catch((error) =>
                  console.error(
                    '[cron] sync failed',
                    id,
                    (error as Error).message,
                  ),
                ),
              ),
          )
        }
        const reminded = await remindDeadlines()
        return Response.json({ synced: running.length, reminded })
      },
    },
  },
})
