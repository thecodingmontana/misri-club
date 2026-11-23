import { matchGame, myGames } from '@misri/core/account'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { apiClient } from './api-client.server'
import { userMiddleware } from './auth.functions'

/** Your latest chess.com games (up to the biggest pick), newest first, straight from chess.com. */
export const getMyGamesFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(({ context }) => apiClient()?.myGames() ?? myGames(context.user.id))

/**
 * One competition game you played, by its chess.com link, however old: the
 * lesson page's fallback when it isn't among your latest games.
 */
export const getMatchGameFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .validator(z.object({ url: z.string().url().max(200) }))
  .handler(
    ({ context, data }) =>
      apiClient()?.matchGame(data.url) ?? matchGame(context.user.id, data.url),
  )
