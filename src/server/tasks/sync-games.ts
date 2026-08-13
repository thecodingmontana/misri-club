import { defineTask } from 'nitro/task'
import { syncGames } from '../sync.server'

/**
 * Scheduled counterpart to the "Sync now" button — same job, same idempotency
 * guarantees (games are deduped on `chess_com_url`), so the board stays current
 * without anyone clicking anything.
 *
 * Cron schedule lives in `vite.config.ts` under `nitro.scheduledTasks`.
 * Run it by hand during development with:
 *   curl -X POST http://localhost:3005/_nitro/tasks/sync:games
 */
export default defineTask({
  meta: {
    name: 'sync:games',
    description: 'Pull finished chess.com games for Misri club members',
  },
  async run() {
    const result = await syncGames()

    console.info(
      `[sync:games] +${result.gamesAdded} games, ${result.gamesLinked} linked to fixtures, ` +
        `${result.archivesFetched} archives in ${result.durationMs}ms` +
        (result.errors.length ? ` (${result.errors.length} errors)` : ''),
    )

    return { result }
  },
})
