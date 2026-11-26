import { createFileRoute } from '@tanstack/react-router'
import { authorised } from '#/server/cron.server'
import { dueWithinTheHour, remindLastHour } from '#/server/notifications.server'
import { syncResults } from '#/server/results.server'

/**
 * Hourly (a GitHub Actions schedule: Vercel's cron here runs daily): a last
 * reminder about an hour before each unplayed game's deadline. Results for
 * those competitions come in first, so a game just played gets no reminder.
 */
export const Route = createFileRoute('/api/cron/last-hour')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorised(request)) {
          return new Response('Unauthorized', { status: 401 })
        }
        const due = await dueWithinTheHour()
        for (const id of due) {
          await syncResults(id).catch((error) =>
            console.error('[cron] sync failed', id, (error as Error).message),
          )
        }
        const reminded = await remindLastHour()
        return Response.json({ synced: due.length, reminded })
      },
    },
  },
})
