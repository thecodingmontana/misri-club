import { createServerFn } from '@tanstack/react-start'
import { and, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db/client.server'
import { chessAccounts, matches } from '#/db/schema'
import {
  type ArchiveGame,
  GAME_COUNTS,
  latestGames,
  toMyGame,
} from '#/lib/my-games'
import { userMiddleware } from './auth.functions'
import {
  fetchArchive,
  fetchArchiveUrls,
  fetchMonthGames,
} from './chesscom.server'
import { takeAllowance } from './rate-limit.server'

// shortcut: stops after a year of archives, so a player who rarely plays may get fewer games; raise if anyone asks
const MAX_MONTHS = 12
const HOUR = 60 * 60 * 1000
const COUNT = Math.max(...GAME_COUNTS)

/** Your chess.com username, after the per-user allowance for chess.com reads. */
async function linkedAccount(userId: string) {
  const [account] = await db
    .select({ username: chessAccounts.username })
    .from(chessAccounts)
    .where(eq(chessAccounts.userId, userId))
    .limit(1)
  if (!account) throw new Error('Link your chess.com account first.')
  if (!(await takeAllowance(`my-games:${userId}`, 1, 30, HOUR))) {
    throw new Error('Too many refreshes. Try again in a while.')
  }
  return account
}

/** Your latest chess.com games (up to the biggest pick), newest first, straight from chess.com. */
export const getMyGamesFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => {
    const account = await linkedAccount(context.user.id)

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

/**
 * One competition game you played, by its chess.com link, however old: the
 * lesson page's fallback when it isn't among your latest games.
 */
export const getMatchGameFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .validator(z.object({ url: z.string().url().max(200) }))
  .handler(async ({ context, data }) => {
    const userId = context.user.id
    // only games of matches you played: the month comes from the match
    const [match] = await db
      .select({ endedAt: matches.endedAt })
      .from(matches)
      .where(
        and(
          eq(matches.gameUrl, data.url),
          or(eq(matches.homeUserId, userId), eq(matches.awayUserId, userId)),
        ),
      )
      .limit(1)
    if (!match?.endedAt) return null
    const account = await linkedAccount(userId)
    const month = match.endedAt.toISOString().slice(0, 7).replace('-', '/')
    const game = (await fetchMonthGames(account.username, month)).find(
      (g) => g.url === data.url,
    )
    return game ? toMyGame(game, account.username) : null
  })
