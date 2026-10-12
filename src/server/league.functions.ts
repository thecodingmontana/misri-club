import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { adminMiddleware } from './auth.functions'
import { fetchPlayerProfile, fetchPlayerRating } from './chesscom.server'
import {
  addPlayerByUsername,
  generateFixtures,
  getMeta,
  listAllPlayers,
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
 * Reads and `syncNow` are public (club data). Every other mutation goes
 * through `adminMiddleware`, which is the actual security boundary.
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
    const player = await budgeted('player', () => getPlayer(data.username))
    if (!player) throw notFound()
    return player
  })

/** Every member's avatar, so each face renders the same on every screen. */
export const getRosterAvatarsFn = createServerFn({ method: 'GET' }).handler(
  async () =>
    (await listAllPlayers()).map((p) => ({
      username: p.username,
      avatar: p.avatar,
    })),
)

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
    // Only club members: otherwise this is an open proxy to chess.com.
    const members = new Set((await listAllPlayers()).map((p) => p.username))
    const ratings = await Promise.all(
      data.usernames
        .filter((username) => members.has(username.toLowerCase()))
        .map((username) =>
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

export const verifyUsernameFn = createServerFn({ method: 'GET' })
  .validator(z.object({ username: z.string().min(1) }))
  .handler(async ({ data }) => {
    const profile = await fetchPlayerProfile(data.username)
    return profile
      ? { valid: true as const, profile }
      : { valid: false as const, profile: null }
  })

// --- Mutations -------------------------------------------------------------

/** A sync is ~25 chess.com requests; once a minute is plenty for a club. */
const SYNC_COOLDOWN_MS = 60_000

/**
 * Deliberately public: syncing is idempotent and only ever reads from
 * chess.com, so anyone can pull the latest games and the board never goes
 * stale waiting for an admin. The cooldown is read from the database, so it
 * holds across every server instance, not just this one.
 */
export const syncNowFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const last = await getMeta('sync:lastRunAt')
    const wait = last ? SYNC_COOLDOWN_MS - (Date.now() - Date.parse(last)) : 0
    if (wait > 0) {
      throw new Error(
        `Synced moments ago. Try again in ${Math.ceil(wait / 1000)}s.`,
      )
    }
    return syncGames()
  },
)

/**
 * Auto-sync grace period. Matchday windows run for days, so a game showing up
 * within ten minutes is plenty fresh, and it caps chess.com at ~6 syncs an hour
 * however many people have the site open.
 */
const AUTO_SYNC_MS = 10 * 60_000

/**
 * Called by every open page on a timer. Syncs only when the last sync (from
 * anyone, on any server instance) is older than the grace period; otherwise it
 * is one cheap read and returns null.
 */
export const autoSyncFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const last = await getMeta('sync:lastRunAt')
    if (last && Date.now() - Date.parse(last) < AUTO_SYNC_MS) return null
    return syncGames()
  },
)

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
    // Pull in games finished just before the close, so they score in the
    // season they were played in rather than being lost at the boundary.
    await syncGames({ refreshRoster: false })
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
