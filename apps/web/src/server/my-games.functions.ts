import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { chessAccounts } from '#/db/schema'
import { type ArchiveGame, GAME_COUNTS, latestGames } from '#/lib/my-games'
import { userMiddleware } from './auth.functions'
import { fetchArchive, fetchArchiveUrls } from './chesscom.server'
import { takeAllowance } from './rate-limit.server'

// shortcut: stops after a year of archives, so a player who rarely plays may get fewer games; raise if anyone asks
const MAX_MONTHS = 12
const HOUR = 60 * 60 * 1000
const COUNT = Math.max(...GAME_COUNTS)

/** Your latest chess.com games (up to the biggest pick), newest first, straight from chess.com. */
export const getMyGamesFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => {
    const [account] = await db
      .select({ username: chessAccounts.username })
      .from(chessAccounts)
      .where(eq(chessAccounts.userId, context.user.id))
      .limit(1)
    if (!account) throw new Error('Link your chess.com account first.')

    if (!(await takeAllowance(`my-games:${context.user.id}`, 1, 30, HOUR))) {
      throw new Error('Too many refreshes. Try again in a while.')
    }

    const months = (await fetchArchiveUrls(account.username))
      .slice(-MAX_MONTHS)
      .reverse()
    const games: Array<ArchiveGame> = []
    for (const month of months) {
      games.push(...(await fetchArchive(month)))
      if (latestGames(games, account.username, COUNT).length >= COUNT) break
    }

    return {
      username: account.username,
      games: latestGames(games, account.username, COUNT),
    }
  })
