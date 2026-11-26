import { pruneAllowances } from '@misri/core/rate-limit'
import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { competitions } from '#/db/schema'
import {
  reconcileAllFixtures,
  startScheduled,
} from '#/server/competitions.server'
import { authorised } from '#/server/cron.server'
import {
  announceAppRelease,
  remindDeadlines,
  remindOrganisers,
  remindStarts,
  sendWeeklySummaries,
} from '#/server/notifications.server'
import { advance, syncResults } from '#/server/results.server'

const SYNC_BATCH = 5

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
          .select({ id: competitions.id, source: competitions.resultSource })
          .from(competitions)
          .where(eq(competitions.status, 'running'))
        // a few at a time: chess.com calls queue anyway, the database stays calm
        for (let i = 0; i < running.length; i += SYNC_BATCH) {
          await Promise.all(
            running.slice(i, i + SYNC_BATCH).map(({ id, source }) =>
              // players' own reports: no chess.com to read, but a passed
              // deadline still settles games and moves the competition on
              (source === 'chesscom' ? syncResults(id) : advance(id)).catch(
                (error) =>
                  console.error(
                    '[cron] sync failed',
                    id,
                    (error as Error).message,
                  ),
              ),
            ),
          )
        }
        const reminded = await remindDeadlines().catch((error) => {
          console.error(
            '[cron] deadline reminders failed',
            (error as Error).message,
          )
          return 0
        })
        const nudged = await remindOrganisers().catch((error) => {
          console.error(
            '[cron] organiser nudges failed',
            (error as Error).message,
          )
          return 0
        })
        const starting = await remindStarts().catch((error) => {
          console.error(
            '[cron] start reminders failed',
            (error as Error).message,
          )
          return 0
        })
        // after this run's results, so last week is complete
        const weekly = await sendWeeklySummaries().catch((error) => {
          console.error(
            '[cron] weekly summaries failed',
            (error as Error).message,
          )
          return 0
        })
        const announced = await announceAppRelease().catch((error) => {
          console.error(
            '[cron] app release announcement failed',
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
          nudged,
          weekly,
          announced,
        })
      },
    },
  },
})
