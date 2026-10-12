import { inArray } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { games, playerGames } from '#/db/schema'
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
  /** New rows for the player pages: every member's games, against anyone. */
  playerGamesAdded: number
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
      for (const username of refreshed.notOnChessCom) {
        errors.push(`${username} is not a chess.com account; skipped.`)
      }
    } catch (error) {
      errors.push(`Roster refresh failed: ${(error as Error).message}`)
    }
  }

  const season = await getOrCreateCurrentSeason()
  const roster = await listActivePlayers()
  const byUsername = new Map(roster.map((p) => [p.username, p]))

  // Recent archive URLs for every active member, keyed to whose archive it is.
  // Two members' games against each other appear in both archives; the
  // `candidates` map below keeps the league game from being inserted twice.
  const archiveOwners = new Map<string, (typeof roster)[number]>()

  await Promise.all(
    roster.map(async (player) => {
      try {
        const urls = await fetchArchiveUrls(player.username)
        for (const url of urls.slice(-ARCHIVE_MONTHS)) {
          archiveOwners.set(url, player)
        }
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

  const ownGames: Array<typeof playerGames.$inferInsert> = []

  let gamesInspected = 0

  await Promise.all(
    [...archiveOwners].map(async ([url, owner]) => {
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
        if (!game.url || !game.white?.username || !game.black?.username)
          continue

        const own = ownGameRow(owner.id, owner.username, game)
        if (own) ownGames.push(own)

        const white = byUsername.get(game.white.username.toLowerCase())
        const black = byUsername.get(game.black.username.toLowerCase())
        if (!white || !black || white.id === black.id) continue

        const endedAt = new Date((game.end_time ?? 0) * 1000)
        // A game only counts once both players were actually in the club.
        if (
          Number.isNaN(endedAt.getTime()) ||
          endedAt <= white.joinedAt ||
          endedAt <= black.joinedAt ||
          // Older than this season: it belongs to one already closed.
          endedAt < season.startedAt
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

  const playerGamesAdded = await insertPlayerGames(ownGames)
  const gamesLinked = await linkGamesToFixtures(season.id)
  await recomputeStandings(season.id, new Date(), { wait: true })

  const finishedAt = new Date()
  await setMeta('sync:lastRunAt', finishedAt.toISOString())

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    seasonId: season.id,
    playersScanned: roster.length,
    archivesFetched: archiveOwners.size,
    gamesInspected,
    gamesAdded,
    gamesLinked,
    playerGamesAdded,
    roster: rosterChanges,
    errors,
  }
}

/** The archive owner's side of a game, or null if the archive isn't theirs. */
function ownGameRow(
  playerId: number,
  username: string,
  game: ArchivedGame,
): typeof playerGames.$inferInsert | null {
  const colour =
    game.white.username.toLowerCase() === username
      ? 'white'
      : game.black.username.toLowerCase() === username
        ? 'black'
        : null
  if (!colour || !game.pgn || !game.end_time) return null

  const me = game[colour]
  const them = game[colour === 'white' ? 'black' : 'white']
  const result = resultOf(game)

  return {
    playerId,
    chessComUrl: game.url,
    endedAt: new Date(game.end_time * 1000),
    timeClass: game.time_class ?? 'unknown',
    rated: game.rated ?? false,
    colour,
    outcome: result === 'draw' ? 'draw' : result === colour ? 'win' : 'loss',
    rating: me.rating ?? null,
    opponent: them.username,
    opponentRating: them.rating ?? null,
    opening: openingName(game.eco),
    pgn: game.pgn,
  }
}

/** `…/openings/Queens-Pawn-Opening-2.Bf4-d6` → `Queens Pawn Opening 2.Bf4 d6` */
function openingName(ecoUrl: string | undefined): string | null {
  const slug = ecoUrl?.split('/openings/')[1]
  return slug ? decodeURIComponent(slug).replaceAll('-', ' ') : null
}

/**
 * Archives are re-read every sync, so most rows are already stored. Asking
 * which ones first keeps us from shipping every PGN back to the database each
 * time just to have it ignored.
 */
async function insertPlayerGames(
  rows: Array<typeof playerGames.$inferInsert>,
): Promise<number> {
  if (rows.length === 0) return 0

  const known = new Set(
    (
      await db
        .select({
          playerId: playerGames.playerId,
          url: playerGames.chessComUrl,
        })
        .from(playerGames)
        .where(
          inArray(
            playerGames.chessComUrl,
            rows.map((row) => row.chessComUrl),
          ),
        )
    ).map((row) => `${row.playerId} ${row.url}`),
  )

  const fresh = rows.filter(
    (row) => !known.has(`${row.playerId} ${row.chessComUrl}`),
  )

  let added = 0
  // Chunked to stay well under Postgres's 65k bind-parameter limit.
  for (let i = 0; i < fresh.length; i += 500) {
    const inserted = await db
      .insert(playerGames)
      .values(fresh.slice(i, i + 500))
      .onConflictDoNothing()
      .returning({ url: playerGames.chessComUrl })
    added += inserted.length
  }
  return added
}
