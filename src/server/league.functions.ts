import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { adminMiddleware } from './auth.functions'
import {
  fetchClubMembers,
  fetchPlayerProfile,
  fetchPlayerRating,
} from './chesscom.server'
import {
  addPlayerByUsername,
  generateFixtures,
  refreshRoster,
  setPlayerActive,
  setWalkover,
  startNewSeason,
} from './league.server'
import {
  getAllTime,
  getFixtures,
  getLeaderboard,
  getPlayer,
  getPlayerGames,
} from './queries.server'
import { syncGames } from './sync.server'

/**
 * The app's RPC surface. Everything here executes on the server only — the
 * client bundle keeps just the fetch stubs, so the Postgres driver and the
 * chess.com client never reach the browser.
 *
 * Note: this league board is deliberately unauthenticated (public club data).
 * The mutations below are therefore reachable by anyone who can reach the app;
 * each is either idempotent (`syncNow`) or non-destructive (`startNewSeason`
 * archives rather than deletes), and `generateFixtures` is refused outright once
 * a scheduled game has been played.
 */

// --- Reads -----------------------------------------------------------------

/**
 * Nothing here is allowed to wait forever.
 *
 * A page read is a handful of indexed queries against a database in the same
 * region; if it has not finished in a few seconds it is not slow, it is stuck,
 * and the only stuck state we have actually seen is a pooled socket that died
 * while the isolate was frozen. Without a bound, that becomes a request Vercel
 * eventually kills at 300s, and the visitor stares at a page that never
 * resolves. Failing at eight seconds turns that into an ordinary error the
 * router can render and the visitor can retry — and a retry lands on a fresh
 * connection, so it succeeds.
 *
 * This is a backstop, not the fix: the short idle timeout in the db client is
 * what stops sockets going stale in the first place.
 */
const READ_BUDGET_MS = 8_000

function budgeted<T>(label: string, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${READ_BUDGET_MS}ms`))
    }, READ_BUDGET_MS)

    work()
      .then(resolve, reject)
      .finally(() => clearTimeout(timer))
  })
}

export const getLeaderboardFn = createServerFn({ method: 'GET' }).handler(
  async () => budgeted('leaderboard', getLeaderboard),
)

export const getFixturesFn = createServerFn({ method: 'GET' }).handler(
  async () => budgeted('fixtures', getFixtures),
)

export const getAllTimeFn = createServerFn({ method: 'GET' }).handler(
  async () => budgeted('all-time', getAllTime),
)

export const getPlayerFn = createServerFn({ method: 'GET' })
  .validator(z.object({ username: z.string().min(1) }))
  .handler(async ({ data }) => {
    const player = await getPlayer(data.username)
    if (!player) throw notFound()
    return player
  })

export const getPlayerGamesFn = createServerFn({ method: 'GET' })
  .validator(z.object({ username: z.string().min(1).max(64) }))
  .handler(async ({ data }) => {
    const result = await budgeted('player games', () =>
      getPlayerGames(data.username),
    )
    if (!result) throw notFound()
    return result
  })

/**
 * Live ratings for the leaderboard. The browser calls this, not chess.com — it
 * is the server that talks to the API, which is why there is no CORS problem.
 */
export const getPlayerRatingsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ usernames: z.array(z.string().min(1)).max(64) }))
  .handler(async ({ data }) => {
    const ratings = await Promise.all(
      data.usernames.map((username) =>
        fetchPlayerRating(username).catch(() => ({
          username,
          rating: null,
          timeClass: null,
        })),
      ),
    )

    return Object.fromEntries(
      ratings.map((entry) => [entry.username, entry] as const),
    )
  })

export const getClubMembersFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { visible, members } = await fetchClubMembers()
    return {
      visible,
      members: members.map((m) => ({
        username: m.username,
        joinedAt: m.joinedAt.getTime(),
      })),
    }
  },
)

/** 404 from chess.com means the username doesn't exist. */
export const verifyUsernameFn = createServerFn({ method: 'GET' })
  .validator(z.object({ username: z.string().min(1) }))
  .handler(async ({ data }) => {
    const profile = await fetchPlayerProfile(data.username)
    return profile
      ? { valid: true as const, profile }
      : { valid: false as const, profile: null }
  })

// --- Mutations -------------------------------------------------------------

/**
 * Deliberately public: syncing is idempotent and only ever reads from
 * chess.com, so anyone can pull the latest games and the board never goes
 * stale waiting for an admin.
 */
export const syncNowFn = createServerFn({ method: 'POST' }).handler(async () =>
  syncGames(),
)

export const refreshRosterFn = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .handler(async () => refreshRoster())

export const generateFixturesFn = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .handler(async () => generateFixtures())
/**
 * Manual roster entry. Needed for private clubs, where chess.com refuses to
 * enumerate members — the username is still verified against the public player
 * endpoint before it is accepted.
 */
export const addPlayerFn = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.object({ username: z.string().trim().min(1).max(64) }))
  .handler(async ({ data }) => addPlayerByUsername(data.username))

export const setPlayerActiveFn = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(
    z.object({ username: z.string().trim().min(1), active: z.boolean() }),
  )
  .handler(async ({ data }) => setPlayerActive(data.username, data.active))

export const startNewSeasonFn = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .handler(async () => {
    const season = await startNewSeason()
    return {
      id: season.id,
      label: season.label,
      startedAt: season.startedAt.getTime(),
    }
  })

/** Awards a walkover to `winner`, or clears it when `winner` is null. */
export const setWalkoverFn = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      fixtureId: z.number().int().positive(),
      winner: z.string().trim().min(1).max(64).nullable(),
    }),
  )
  .handler(async ({ data }) => setWalkover(data.fixtureId, data.winner))
