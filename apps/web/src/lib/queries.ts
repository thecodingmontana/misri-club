import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { avatarUrl } from '#/lib/avatar'
import {
  autoSyncFn,
  getAllTimeFn,
  getFixturesFn,
  getLeaderboardFn,
  getPlayerFn,
  getPlayerGamesFn,
  getRosterAvatarsFn,
  syncNowFn,
} from '#/server/league.functions'

/**
 * Every league read goes through TanStack Query: loaders warm the cache (and
 * stream it to the client on SSR), components read it, and moving between
 * pages reuses what is fresh instead of refetching. All keys start with
 * `league`, so one invalidation refreshes everything after a write.
 */

export const leaderboardQuery = queryOptions({
  queryKey: ['league', 'leaderboard'],
  queryFn: () => getLeaderboardFn(),
  staleTime: 30_000,
})

export const fixturesQuery = queryOptions({
  queryKey: ['league', 'fixtures'],
  queryFn: () => getFixturesFn(),
  staleTime: 30_000,
})

export const allTimeQuery = queryOptions({
  queryKey: ['league', 'all-time'],
  queryFn: () => getAllTimeFn(),
  staleTime: 5 * 60_000,
})

export const playerQuery = (username: string) =>
  queryOptions({
    queryKey: ['league', 'player', username.toLowerCase()],
    queryFn: () => getPlayerFn({ data: { username } }),
    staleTime: 60_000,
  })

/** Changes only when a sync stores new games, so it can sit for a while. */
export const playerGamesQuery = (username: string) =>
  queryOptions({
    queryKey: ['league', 'player-games', username.toLowerCase()],
    queryFn: () => getPlayerGamesFn({ data: { username } }),
    staleTime: 5 * 60_000,
  })

/** Small and slow-changing; the root loader warms it for every page. */
export const rosterAvatarsQuery = queryOptions({
  queryKey: ['league', 'roster-avatars'],
  queryFn: () => getRosterAvatarsFn(),
  staleTime: 10 * 60_000,
})

/**
 * The one avatar for a username, wherever it is drawn: the member's chess.com
 * picture if they are in the club, else a DiceBear face seeded by the name.
 */
export function useAvatarUrl(username: string) {
  const { data } = useQuery(rosterAvatarsQuery)
  const key = username.toLowerCase()
  return avatarUrl(username, data?.find((p) => p.username === key)?.avatar)
}

/** After any league write: drop cached reads and rerun the route loaders. */
export function useRefreshLeague() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['league'] })
    await router.invalidate()
  }
}

/** The one "pull games from chess.com" action, shared by every sync button. */
export function useSyncNow() {
  const sync = useServerFn(syncNowFn)
  const refresh = useRefreshLeague()

  return useMutation({
    mutationFn: () => sync(),
    onSuccess: async (result) => {
      await refresh()
      toast.success(
        result.gamesAdded === 0
          ? 'No new league games'
          : `${result.gamesAdded} new league game${result.gamesAdded === 1 ? '' : 's'}`,
        {
          description: result.errors.length
            ? result.errors.join(' ')
            : `${result.gamesLinked} counted · ${result.playerGamesAdded} added to player stats`,
        },
      )
    },
    onError: (error: Error) =>
      toast.error('Sync failed', { description: error.message }),
  })
}

/** How often an open, visible page asks the server whether a sync is due. */
const AUTO_SYNC_CHECK_MS = 5 * 60_000

/**
 * Keeps the board current with nobody pressing Sync: on load, on a timer, and
 * when the tab comes back into view. The server decides whether a sync is due,
 * so many open tabs still mean at most one sync per grace period.
 */
export function useAutoSync() {
  const autoSync = useServerFn(autoSyncFn)
  const refresh = useRefreshLeague()

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount once; `refresh` is a new function each render, and listing it would re-sync on every render.
  useEffect(() => {
    let running = false
    const tick = async () => {
      if (running || document.visibilityState !== 'visible') return
      running = true
      try {
        const result = await autoSync()
        if (
          result &&
          (result.gamesAdded > 0 ||
            result.gamesLinked > 0 ||
            result.playerGamesAdded > 0)
        ) {
          await refresh()
          if (result.gamesAdded > 0) {
            toast(
              `${result.gamesAdded} new league game${result.gamesAdded === 1 ? '' : 's'} synced`,
            )
          }
        }
      } catch {
        // Background work: a failed check just waits for the next one.
      } finally {
        running = false
      }
    }

    void tick()
    const timer = setInterval(tick, AUTO_SYNC_CHECK_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
}
