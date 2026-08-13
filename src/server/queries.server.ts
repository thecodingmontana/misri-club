import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { db } from '#/db/client.server'
import {
  fixtures,
  games,
  players,
  seasonStandings,
  seasons,
} from '#/db/schema'
import { matchdayCount } from '#/lib/round-robin'
import { CLUB_ID, clubUrl } from './chesscom.server'
import {
  getMeta,
  getOrCreateCurrentSeason,
  hasFixtures,
  isSeasonLocked,
  listAllPlayers,
  unscheduledPlayers,
} from './league.server'

const white = alias(players, 'white')
const black = alias(players, 'black')
const home = alias(players, 'home')
const away = alias(players, 'away')
const bye = alias(players, 'bye')

export interface StandingRow {
  playerId: number
  username: string
  displayName: string | null
  avatar: string | null
  points: number
  wins: number
  draws: number
  losses: number
  played: number
}

export interface GameRow {
  id: number
  chessComUrl: string
  white: string
  black: string
  result: 'white' | 'black' | 'draw'
  timeClass: string | null
  endedAt: number
  matchday: number | null
  source: 'auto' | 'manual'
}

async function standingsFor(seasonId: number): Promise<Array<StandingRow>> {
  const rows = await db
    .select({
      playerId: seasonStandings.playerId,
      username: players.username,
      displayName: players.displayName,
      avatar: players.avatar,
      points: seasonStandings.points,
      wins: seasonStandings.wins,
      draws: seasonStandings.draws,
      losses: seasonStandings.losses,
    })
    .from(seasonStandings)
    .innerJoin(players, eq(players.id, seasonStandings.playerId))
    .where(eq(seasonStandings.seasonId, seasonId))
    .orderBy(
      desc(seasonStandings.points),
      desc(seasonStandings.wins),
      players.username,
    )
    .all()

  return rows.map((row) => ({ ...row, played: row.wins + row.draws + row.losses }))
}

async function gamesFor(
  seasonId: number,
  limit?: number,
): Promise<Array<GameRow>> {
  const query = db
    .select({
      id: games.id,
      chessComUrl: games.chessComUrl,
      white: white.username,
      black: black.username,
      result: games.result,
      timeClass: games.timeClass,
      endedAt: games.endedAt,
      matchday: fixtures.matchday,
      source: games.source,
    })
    .from(games)
    .innerJoin(white, eq(white.id, games.whitePlayerId))
    .innerJoin(black, eq(black.id, games.blackPlayerId))
    .leftJoin(fixtures, eq(fixtures.id, games.fixtureId))
    .where(eq(games.seasonId, seasonId))
    .orderBy(desc(games.endedAt))

  const rows = limit ? await query.limit(limit).all() : await query.all()

  return rows.map((row) => ({ ...row, endedAt: row.endedAt.getTime() }))
}

// ---------------------------------------------------------------------------
// Leaderboard (`/`)
// ---------------------------------------------------------------------------

export async function getLeaderboard() {
  const season = await getOrCreateCurrentSeason()
  const standings = await standingsFor(season.id)
  const recentGames = await gamesFor(season.id, 12)

  const totalGames =
    (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(games)
        .where(eq(games.seasonId, season.id))
        .get()
    )?.n ?? 0

  const scheduled =
    (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(fixtures)
        .where(
          and(
            eq(fixtures.seasonId, season.id),
            isNull(fixtures.byePlayerId),
          ),
        )
        .get()
    )?.n ?? 0

  const played =
    (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(games)
        .where(
          and(eq(games.seasonId, season.id), sql`${games.fixtureId} is not null`),
        )
        .get()
    )?.n ?? 0

  const visibility = await getMeta('club:visibility')

  return {
    club: {
      id: CLUB_ID,
      url: clubUrl(),
      name: (await getMeta('club:name')) ?? 'Misri',
      visibility,
      /** chess.com only enumerates members of public clubs */
      membersListable: visibility === 'public',
      membersCount: Number((await getMeta('club:membersCount')) ?? 0),
    },
    roster: (await listAllPlayers()).map((p) => ({
      username: p.username,
      active: p.active,
    })),
    season: {
      id: season.id,
      label: season.label,
      startedAt: season.startedAt.getTime(),
    },
    standings,
    recentGames,
    stats: {
      players: standings.length,
      totalGames,
      scheduledFixtures: scheduled,
      playedFixtures: played,
    },
    lastSyncAt: await getMeta('sync:lastRunAt'),
  }
}

export type LeaderboardData = ReturnType<typeof getLeaderboard>

// ---------------------------------------------------------------------------
// Fixtures (`/fixtures`)
// ---------------------------------------------------------------------------

export interface FixtureRow {
  id: number
  matchday: number
  leg: 1 | 2
  home: string | null
  away: string | null
  bye: string | null
  game: {
    chessComUrl: string
    result: 'white' | 'black' | 'draw'
    whiteUsername: string
    endedAt: number
  } | null
}

export async function getFixtures() {
  const season = await getOrCreateCurrentSeason()

  const rows = await db
    .select({
      id: fixtures.id,
      matchday: fixtures.matchday,
      leg: fixtures.leg,
      home: home.username,
      away: away.username,
      bye: bye.username,
      gameUrl: games.chessComUrl,
      gameResult: games.result,
      gameEndedAt: games.endedAt,
      gameWhite: white.username,
    })
    .from(fixtures)
    .leftJoin(home, eq(home.id, fixtures.homePlayerId))
    .leftJoin(away, eq(away.id, fixtures.awayPlayerId))
    .leftJoin(bye, eq(bye.id, fixtures.byePlayerId))
    .leftJoin(games, eq(games.fixtureId, fixtures.id))
    .leftJoin(white, eq(white.id, games.whitePlayerId))
    .where(eq(fixtures.seasonId, season.id))
    .orderBy(fixtures.matchday, fixtures.id)
    .all()

  const list: Array<FixtureRow> = rows.map((row) => ({
    id: row.id,
    matchday: row.matchday,
    leg: row.leg as 1 | 2,
    home: row.home,
    away: row.away,
    bye: row.bye,
    game:
      row.gameUrl && row.gameResult && row.gameEndedAt && row.gameWhite
        ? {
            chessComUrl: row.gameUrl,
            result: row.gameResult,
            whiteUsername: row.gameWhite,
            endedAt: row.gameEndedAt.getTime(),
          }
        : null,
  }))

  const activeCount =
    (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(players)
        .where(eq(players.active, true))
        .get()
    )?.n ?? 0

  return {
    season: {
      id: season.id,
      label: season.label,
      startedAt: season.startedAt.getTime(),
    },
    locked: await isSeasonLocked(season.id),
    generated: await hasFixtures(season.id),
    fixtures: list,
    unscheduled: (await unscheduledPlayers(season.id)).map((p) => p.username),
    projectedMatchdays: matchdayCount(activeCount),
    activePlayers: activeCount,
  }
}

export type FixturesData = ReturnType<typeof getFixtures>

// ---------------------------------------------------------------------------
// All-time (`/all-time`)
// ---------------------------------------------------------------------------

export interface AllTimeRow {
  playerId: number
  username: string
  points: number
  wins: number
  draws: number
  losses: number
  played: number
  seasonsPlayed: number
  /** seasonId -> that season's line */
  perSeason: Record<
    number,
    { points: number; wins: number; draws: number; losses: number }
  >
}

/**
 * All-time totals are derived, never stored: a `SUM()` over `season_standings`
 * grouped by player. Adding a season needs no migration.
 */
export async function getAllTime() {
  const seasonList = (
    await db.select().from(seasons).orderBy(seasons.startedAt).all()
  ).map((s) => ({
    id: s.id,
    label: s.label,
    startedAt: s.startedAt.getTime(),
    endedAt: s.endedAt?.getTime() ?? null,
  }))

  const totals = await db
    .select({
      playerId: seasonStandings.playerId,
      username: players.username,
      points: sql<number>`sum(${seasonStandings.points})`,
      wins: sql<number>`sum(${seasonStandings.wins})`,
      draws: sql<number>`sum(${seasonStandings.draws})`,
      losses: sql<number>`sum(${seasonStandings.losses})`,
      seasonsPlayed: sql<number>`count(distinct ${seasonStandings.seasonId})`,
    })
    .from(seasonStandings)
    .innerJoin(players, eq(players.id, seasonStandings.playerId))
    .groupBy(seasonStandings.playerId)
    .all()

  const breakdown = await db.select().from(seasonStandings).all()

  const perPlayer = new Map<number, AllTimeRow['perSeason']>()
  for (const row of breakdown) {
    const bucket = perPlayer.get(row.playerId) ?? {}
    bucket[row.seasonId] = {
      points: row.points,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
    }
    perPlayer.set(row.playerId, bucket)
  }

  const rows: Array<AllTimeRow> = totals
    .map((row) => ({
      ...row,
      played: row.wins + row.draws + row.losses,
      perSeason: perPlayer.get(row.playerId) ?? {},
    }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins)

  return { seasons: seasonList, rows }
}

export type AllTimeData = ReturnType<typeof getAllTime>

// ---------------------------------------------------------------------------
// Player profile (`/players/$username`)
// ---------------------------------------------------------------------------

export async function getPlayer(username: string) {
  const player = await db
    .select()
    .from(players)
    .where(eq(players.username, username.toLowerCase()))
    .get()

  if (!player) return null

  const history = (
    await db
      .select({
        seasonId: seasons.id,
        label: seasons.label,
        startedAt: seasons.startedAt,
        endedAt: seasons.endedAt,
        points: seasonStandings.points,
        wins: seasonStandings.wins,
        draws: seasonStandings.draws,
        losses: seasonStandings.losses,
      })
      .from(seasonStandings)
      .innerJoin(seasons, eq(seasons.id, seasonStandings.seasonId))
      .where(eq(seasonStandings.playerId, player.id))
      .orderBy(desc(seasons.startedAt))
      .all()
  ).map((row) => ({
    ...row,
    startedAt: row.startedAt.getTime(),
    endedAt: row.endedAt?.getTime() ?? null,
    played: row.wins + row.draws + row.losses,
  }))

  const gameRows = (
    await db
      .select({
        id: games.id,
        chessComUrl: games.chessComUrl,
        white: white.username,
        black: black.username,
        result: games.result,
        timeClass: games.timeClass,
        endedAt: games.endedAt,
        seasonLabel: seasons.label,
        matchday: fixtures.matchday,
      })
      .from(games)
      .innerJoin(white, eq(white.id, games.whitePlayerId))
      .innerJoin(black, eq(black.id, games.blackPlayerId))
      .innerJoin(seasons, eq(seasons.id, games.seasonId))
      .leftJoin(fixtures, eq(fixtures.id, games.fixtureId))
      .where(
        or(
          eq(games.whitePlayerId, player.id),
          eq(games.blackPlayerId, player.id),
        ),
      )
      .orderBy(desc(games.endedAt))
      .all()
  ).map((row) => {
    const playedWhite = row.white === player.username
    const outcome =
      row.result === 'draw'
        ? ('draw' as const)
        : (row.result === 'white') === playedWhite
          ? ('win' as const)
          : ('loss' as const)

    return {
      ...row,
      endedAt: row.endedAt.getTime(),
      colour: playedWhite ? ('white' as const) : ('black' as const),
      opponent: playedWhite ? row.black : row.white,
      outcome,
    }
  })

  const totals = history.reduce(
    (acc, season) => ({
      points: acc.points + season.points,
      wins: acc.wins + season.wins,
      draws: acc.draws + season.draws,
      losses: acc.losses + season.losses,
    }),
    { points: 0, wins: 0, draws: 0, losses: 0 },
  )

  return {
    player: {
      id: player.id,
      username: player.username,
      displayName: player.displayName,
      avatar: player.avatar,
      active: player.active,
      joinedAt: player.joinedAt.getTime(),
    },
    history,
    games: gameRows,
    totals: { ...totals, played: totals.wins + totals.draws + totals.losses },
  }
}

export type PlayerData = NonNullable<ReturnType<typeof getPlayer>>
