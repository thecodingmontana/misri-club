import { eq, inArray } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { games, players } from '#/db/schema'
import type { ArchivedGame } from './chesscom.server'
import { fetchArchive, fetchArchiveUrls } from './chesscom.server'
import {
  getOrCreateCurrentSeason,
  linkGamesToFixtures,
  listActivePlayers,
  recomputeStandings,
  refreshRoster,
  setMeta,
} from './league.server'

/** How many monthly archives back we scan per player. */
const ARCHIVE_MONTHS = 2

export interface SyncResult {
  startedAt: string
  finishedAt: string
  durationMs: number
  seasonId: number
  playersScanned: number
  archivesFetched: number
  gamesInspected: number
  gamesAdded: number
  gamesLinked: number
  roster: {
    added: Array<string>
    deactivated: Array<string>
    /** false when the club is private and chess.com won't list its members */
    membersVisible: boolean
  }
  errors: Array<string>
}

/**
 * chess.com marks the winning side's `result` as "win"; every other value
 * (checkmated, resigned, timeout, agreed, stalemate, …) is either a loss or a
 * draw condition. If neither side won, it was drawn.
 */
function resultOf(game: ArchivedGame): 'white' | 'black' | 'draw' {
  if (game.white.result === 'win') return 'white'
  if (game.black.result === 'win') return 'black'
  return 'draw'
}

/** Only one sync at a time; concurrent callers join the run already in flight. */
let inFlight: Promise<SyncResult> | null = null

export function syncGames(options: { refreshRoster?: boolean } = {}) {
  inFlight ??= runSync(options).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runSync({
  refreshRoster: shouldRefreshRoster = true,
}: {
  refreshRoster?: boolean
}): Promise<SyncResult> {
  const startedAt = new Date()
  const errors: Array<string> = []
  let rosterChanges: SyncResult['roster'] = {
    added: [],
    deactivated: [],
    membersVisible: true,
  }

  if (shouldRefreshRoster) {
    try {
      const refreshed = await refreshRoster()
      rosterChanges = {
        added: refreshed.added,
        deactivated: refreshed.deactivated,
        membersVisible: refreshed.membersVisible,
      }
    } catch (error) {
      errors.push(`Roster refresh failed: ${(error as Error).message}`)
    }
  }

  const season = await getOrCreateCurrentSeason()
  const roster = await listActivePlayers()
  const byUsername = new Map(roster.map((p) => [p.username, p]))

  // Collect the recent archive URLs for every active member. Archives are
  // per-player, but two members' games against each other appear in both, so
  // the set below keeps us from fetching or inserting anything twice.
  const archiveUrls = new Set<string>()

  await Promise.all(
    roster.map(async (player) => {
      try {
        const urls = await fetchArchiveUrls(player.username)
        for (const url of urls.slice(-ARCHIVE_MONTHS)) archiveUrls.add(url)
      } catch (error) {
        errors.push(
          `Archive list failed for ${player.username}: ${(error as Error).message}`,
        )
      }
    }),
  )

  const candidates = new Map<
    string,
    {
      chessComUrl: string
      whitePlayerId: number
      blackPlayerId: number
      result: 'white' | 'black' | 'draw'
      timeClass: string | null
      endedAt: Date
    }
  >()

  let gamesInspected = 0

  await Promise.all(
    [...archiveUrls].map(async (url) => {
      let archive: Array<ArchivedGame>
      try {
        archive = await fetchArchive(url)
      } catch (error) {
        errors.push(
          `Archive fetch failed for ${url}: ${(error as Error).message}`,
        )
        return
      }

      for (const game of archive) {
        gamesInspected++

        // Standard chess only — variants aren't part of the league.
        if (game.rules && game.rules !== 'chess') continue
        if (!game.url || !game.white?.username || !game.black?.username) continue

        const white = byUsername.get(game.white.username.toLowerCase())
        const black = byUsername.get(game.black.username.toLowerCase())
        if (!white || !black || white.id === black.id) continue

        const endedAt = new Date((game.end_time ?? 0) * 1000)
        // A game only counts once both players were actually in the club.
        if (
          Number.isNaN(endedAt.getTime()) ||
          endedAt <= white.joinedAt ||
          endedAt <= black.joinedAt
        ) {
          continue
        }

        candidates.set(game.url, {
          chessComUrl: game.url,
          whitePlayerId: white.id,
          blackPlayerId: black.id,
          result: resultOf(game),
          timeClass: game.time_class ?? null,
          endedAt,
        })
      }
    }),
  )

  let gamesAdded = 0

  if (candidates.size > 0) {
    const urls = [...candidates.keys()]
    const knownRows = await db
      .select({ url: games.chessComUrl })
      .from(games)
      .where(inArray(games.chessComUrl, urls))

    const known = new Set(knownRows.map((row) => row.url))
    const fresh = [...candidates.values()].filter(
      (game) => !known.has(game.chessComUrl),
    )

    if (fresh.length > 0) {
      // `chess_com_url` is unique, so a racing sync can't double-insert.
      const inserted = await db
        .insert(games)
        .values(
          fresh.map((game) => ({
            seasonId: season.id,
            source: 'auto' as const,
            ...game,
          })),
        )
        .onConflictDoNothing({ target: games.chessComUrl })
        .returning({ id: games.id })

      gamesAdded = inserted.length
    }
  }

  const gamesLinked = await linkGamesToFixtures(season.id)
  await recomputeStandings(season.id)

  const finishedAt = new Date()
  await setMeta('sync:lastRunAt', finishedAt.toISOString())

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    seasonId: season.id,
    playersScanned: roster.length,
    archivesFetched: archiveUrls.size,
    gamesInspected,
    gamesAdded,
    gamesLinked,
    roster: rosterChanges,
    errors,
  }
}

/**
 * Records a game by hand — for club games the API can't see, or corrections.
 * Shares the `chessComUrl` dedup key with the automatic path.
 */
export async function recordManualGame(input: {
  whiteUsername: string
  blackUsername: string
  result: 'white' | 'black' | 'draw'
  chessComUrl: string
  endedAt?: Date
}) {
  const season = await getOrCreateCurrentSeason()

  const [white] = await db
    .select()
    .from(players)
    .where(eq(players.username, input.whiteUsername.toLowerCase()))
    .limit(1)

  const [black] = await db
    .select()
    .from(players)
    .where(eq(players.username, input.blackUsername.toLowerCase()))
    .limit(1)

  if (!white || !black) throw new Error('Both players must be on the roster.')
  if (white.id === black.id) throw new Error('A player cannot play themselves.')

  const inserted = await db
    .insert(games)
    .values({
      seasonId: season.id,
      chessComUrl: input.chessComUrl,
      whitePlayerId: white.id,
      blackPlayerId: black.id,
      result: input.result,
      endedAt: input.endedAt ?? new Date(),
      source: 'manual',
    })
    .onConflictDoNothing({ target: games.chessComUrl })
    .returning({ id: games.id })

  if (inserted.length === 0) {
    throw new Error('That game URL has already been recorded.')
  }

  await linkGamesToFixtures(season.id)
  await recomputeStandings(season.id)
}
