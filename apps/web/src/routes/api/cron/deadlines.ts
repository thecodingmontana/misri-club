import { timingSafeEqual } from 'node:crypto'
import { pruneAllowances } from '@misri/core/rate-limit'
import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { competitions } from '#/db/schema'
import {
  reconcileAllFixtures,
  startScheduled,
} from '#/server/competitions.server'
import { remindDeadlines, remindStarts } from '#/server/notifications.server'
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
        const started = await startScheduled().catch((error) => {
          console.error(
            '[cron] scheduled starts failed',
            (error as Error).message,
          )
          return 0
        })
        // every pair of members has their games before results are read
        const added = await reconcileAllFixtures().catch((error) => {
          console.error(
            '[cron] fixture recheck failed',
            (error as Error).message,
          )
          return 0
        })
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
        const starting = await remindStarts().catch((error) => {
          console.error(
            '[cron] start reminders failed',
            (error as Error).message,
          )
          return 0
        })
        await pruneAllowances().catch((error) =>
          console.error('[cron] prune failed', (error as Error).message),
        )
        return Response.json({
          started,
          added,
          synced: running.length,
          reminded,
          starting,
        })
      },
    },
  },
})
