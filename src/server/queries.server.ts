import { asc, desc, eq, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '#/db/client.server'
import { fixtures, games, players, seasonStandings, seasons } from '#/db/schema'
import { matchdayCount } from '#/lib/round-robin'
import { CLUB_ID, clubUrl } from './chesscom.server'
import {
  DEFAULT_MATCHDAY_DAYS,
  getManyMeta,
  getOrCreateCurrentSeason,
  isSeasonLocked,
  listAllPlayers,
  recomputeStandingsIfStale,
  unscheduledPlayers,
} from './league.server'

const white = alias(players, 'white')
const black = alias(players, 'black')
const home = alias(players, 'home')
const away = alias(players, 'away')
const bye = alias(players, 'bye')

export type FixtureStatus = 'upcoming' | 'live' | 'played' | 'expired' | 'bye'
export type Outcome = 'win' | 'draw' | 'loss' | 'forfeit'

export interface GameRow {
  id: number
  chessComUrl: string
  white: string
  black: string
  result: 'white' | 'black' | 'draw'
  timeClass: string | null
  endedAt: number
  matchday: number | null
  /** Unlinked games are friendlies — shown, but they do not score. */
  counts: boolean
}

async function recentGames(
  seasonId: number,
  limit: number,
): Promise<Array<GameRow>> {
  const rows = await db
    .select({
      id: games.id,
      chessComUrl: games.chessComUrl,
      white: white.username,
      black: black.username,
      result: games.result,
      timeClass: games.timeClass,
      endedAt: games.endedAt,
      matchday: fixtures.matchday,
    })
    .from(games)
    .innerJoin(white, eq(white.id, games.whitePlayerId))
    .innerJoin(black, eq(black.id, games.blackPlayerId))
    .leftJoin(fixtures, eq(fixtures.id, games.fixtureId))
    .where(eq(games.seasonId, seasonId))
    .orderBy(desc(games.endedAt))
    .limit(limit)

  return rows.map((row) => ({
    ...row,
    endedAt: row.endedAt.getTime(),
    counts: row.matchday !== null,
  }))
}

interface FixtureRecord {
  id: number
  matchday: number
  leg: number
  homeId: number | null
  awayId: number | null
  byeId: number | null
  home: string | null
  away: string | null
  bye: string | null
  opensAt: Date
  dueAt: Date
  gameUrl: string | null
  gameResult: 'white' | 'black' | 'draw' | null
  gameWhiteId: number | null
  gameEndedAt: Date | null
}

async function seasonFixtures(seasonId: number): Promise<Array<FixtureRecord>> {
  return db
    .select({
      id: fixtures.id,
      matchday: fixtures.matchday,
      leg: fixtures.leg,
      homeId: fixtures.homePlayerId,
      awayId: fixtures.awayPlayerId,
      byeId: fixtures.byePlayerId,
      home: home.username,
      away: away.username,
      bye: bye.username,
      opensAt: fixtures.opensAt,
      dueAt: fixtures.dueAt,
      gameUrl: games.chessComUrl,
      gameResult: games.result,
      gameWhiteId: games.whitePlayerId,
      gameEndedAt: games.endedAt,
    })
    .from(fixtures)
    .leftJoin(home, eq(home.id, fixtures.homePlayerId))
    .leftJoin(away, eq(away.id, fixtures.awayPlayerId))
    .leftJoin(bye, eq(bye.id, fixtures.byePlayerId))
    .leftJoin(games, eq(games.fixtureId, fixtures.id))
    .where(eq(fixtures.seasonId, seasonId))
    .orderBy(asc(fixtures.matchday), asc(fixtures.id))
}

function statusOf(fixture: FixtureRecord, now: Date): FixtureStatus {
  if (fixture.byeId) return 'bye'
  if (fixture.gameUrl) return 'played'
  if (now < fixture.opensAt) return 'upcoming'
  if (now < fixture.dueAt) return 'live'
  return 'expired'
}

export interface FixtureView {
  id: number
  matchday: number
  leg: number
  home: string | null
  away: string | null
  bye: string | null
  opensAt: number
  dueAt: number
  status: FixtureStatus
  game: {
    chessComUrl: string
    result: 'white' | 'black' | 'draw'
    homeWon: boolean
    endedAt: number
  } | null
}

function toView(fixture: FixtureRecord, now: Date): FixtureView {
  const homeWon =
    fixture.gameResult !== null &&
    fixture.gameResult !== 'draw' &&
    (fixture.gameResult === 'white') === (fixture.gameWhiteId === fixture.homeId)

  return {
    id: fixture.id,
    matchday: fixture.matchday,
    leg: fixture.leg,
    home: fixture.home,
    away: fixture.away,
    bye: fixture.bye,
    opensAt: fixture.opensAt.getTime(),
    dueAt: fixture.dueAt.getTime(),
    status: statusOf(fixture, now),
    game:
      fixture.gameUrl && fixture.gameResult && fixture.gameEndedAt
        ? {
            chessComUrl: fixture.gameUrl,
            result: fixture.gameResult,
            homeWon,
            endedAt: fixture.gameEndedAt.getTime(),
          }
        : null,
  }
}

// ---------------------------------------------------------------------------
// Leaderboard (`/`)
// ---------------------------------------------------------------------------

export interface StandingRow {
  playerId: number
  username: string
  avatar: string | null
  points: number
  wins: number
  draws: number
  losses: number
  forfeits: number
  played: number
  /** Per-matchday cell, ordered by matchday — drives the grid on the table. */
  cells: Array<{ matchday: number; outcome: Outcome | null; status: FixtureStatus }>
}

export async function getLeaderboard() {
  const season = await getOrCreateCurrentSeason()
  const now = new Date()

  // Standings move with the clock: a fixture can expire without anything being
  // written. Checking on read is what lets this app run with no cron — and the
  // check short-circuits unless a window has actually closed since last time.
  await recomputeStandingsIfStale(season.id, now)

  // All five are independent. Kicking them off before the first await runs them
  // concurrently, so the page costs one round trip's latency rather than five.
  const standingsQuery = db
    .select({
      playerId: seasonStandings.playerId,
      username: players.username,
      avatar: players.avatar,
      points: seasonStandings.points,
      wins: seasonStandings.wins,
      draws: seasonStandings.draws,
      losses: seasonStandings.losses,
      forfeits: seasonStandings.forfeits,
    })
    .from(seasonStandings)
    .innerJoin(players, eq(players.id, seasonStandings.playerId))
    .where(eq(seasonStandings.seasonId, season.id))
    .orderBy(
      desc(seasonStandings.points),
      desc(seasonStandings.wins),
      asc(players.username),
    )

  const fixturesQuery = seasonFixtures(season.id)
  const rosterQuery = listAllPlayers()
  const gamesQuery = recentGames(season.id, 10)
  const metaQuery = getManyMeta([
    'club:name',
    'club:visibility',
    'club:membersCount',
    'sync:lastRunAt',
  ])

  const standingRows = await standingsQuery
  const allFixtures = await fixturesQuery
  const roster = await rosterQuery
  const recent = await gamesQuery
  const meta = await metaQuery

  const matchdays = [...new Set(allFixtures.map((f) => f.matchday))].sort(
    (a, b) => a - b,
  )

  const standings: Array<StandingRow> = standingRows.map((row) => {
    const cells = matchdays.map((matchday) => {
      const fixture = allFixtures.find(
        (f) =>
          f.matchday === matchday &&
          (f.homeId === row.playerId ||
            f.awayId === row.playerId ||
            f.byeId === row.playerId),
      )

      if (!fixture) return { matchday, outcome: null, status: 'bye' as const }

      const status = statusOf(fixture, now)
      let outcome: Outcome | null = null

      if (status === 'played' && fixture.gameResult) {
        if (fixture.gameResult === 'draw') outcome = 'draw'
        else {
          const playedWhite = fixture.gameWhiteId === row.playerId
          outcome =
            (fixture.gameResult === 'white') === playedWhite ? 'win' : 'loss'
        }
      } else if (status === 'expired') {
        outcome = 'forfeit'
      }

      return { matchday, outcome, status }
    })

    return {
      ...row,
      played: row.wins + row.draws + row.losses,
      cells,
    }
  })

  const current = currentMatchday(allFixtures, now)

  return {
    club: {
      id: CLUB_ID,
      url: clubUrl(),
      name: meta['club:name'] ?? 'Misri',
      visibility: meta['club:visibility'],
      membersListable: meta['club:visibility'] === 'public',
      membersCount: Number(meta['club:membersCount'] ?? 0),
    },
    roster: roster.map((p) => ({
      username: p.username,
      avatar: p.avatar,
      active: p.active,
    })),
    season: {
      id: season.id,
      label: season.label,
      startedAt: season.startedAt.getTime(),
      matchdayDays: season.matchdayDays,
    },
    matchdays,
    current,
    standings,
    recentGames: recent,
    lastSyncAt: meta['sync:lastRunAt'],
    now: now.getTime(),
  }
}

export type LeaderboardData = Awaited<ReturnType<typeof getLeaderboard>>

/** The matchday whose window contains `now`, or the next one to open. */
function currentMatchday(all: Array<FixtureRecord>, now: Date) {
  if (all.length === 0) return null

  const byMatchday = new Map<number, { opensAt: Date; dueAt: Date }>()
  for (const f of all) {
    if (!byMatchday.has(f.matchday)) {
      byMatchday.set(f.matchday, { opensAt: f.opensAt, dueAt: f.dueAt })
    }
  }

  const ordered = [...byMatchday.entries()].sort(([a], [b]) => a - b)

  const live = ordered.find(
    ([, w]) => now >= w.opensAt && now < w.dueAt,
  )
  const next = ordered.find(([, w]) => now < w.opensAt)
  const chosen = live ?? next

  if (!chosen) {
    const [matchday, window] = ordered[ordered.length - 1]
    return {
      matchday,
      opensAt: window.opensAt.getTime(),
      dueAt: window.dueAt.getTime(),
      state: 'finished' as const,
      fixtures: all
        .filter((f) => f.matchday === matchday)
        .map((f) => toView(f, now)),
    }
  }

  const [matchday, window] = chosen
  return {
    matchday,
    opensAt: window.opensAt.getTime(),
    dueAt: window.dueAt.getTime(),
    state: (live ? 'live' : 'upcoming') as 'live' | 'upcoming',
    fixtures: all
      .filter((f) => f.matchday === matchday)
      .map((f) => toView(f, now)),
  }
}

// ---------------------------------------------------------------------------
// Fixtures (`/fixtures`)
// ---------------------------------------------------------------------------

export async function getFixtures() {
  const season = await getOrCreateCurrentSeason()
  const now = new Date()

  await recomputeStandingsIfStale(season.id, now)

  const fixturesQuery = seasonFixtures(season.id)
  const countQuery = db
    .select({ n: sql<number>`count(*)::int` })
    .from(players)
    .where(eq(players.active, true))
  const lockedQuery = isSeasonLocked(season.id)
  const unscheduledQuery = unscheduledPlayers(season.id)

  const all = await fixturesQuery
  const [{ n: activeCount }] = await countQuery
  const locked = await lockedQuery
  const unscheduled = await unscheduledQuery

  const list = all.map((f) => toView(f, now))

  return {
    season: {
      id: season.id,
      label: season.label,
      startedAt: season.startedAt.getTime(),
      matchdayDays: season.matchdayDays,
    },
    locked,
    // Derived from the fixtures we already fetched — no extra round trip.
    generated: all.length > 0,
    fixtures: list,
    unscheduled: unscheduled.map((p) => p.username),
    projectedMatchdays: matchdayCount(activeCount),
    projectedDays: matchdayCount(activeCount) * (season.matchdayDays || DEFAULT_MATCHDAY_DAYS),
    activePlayers: activeCount,
    now: now.getTime(),
  }
}

export type FixturesData = Awaited<ReturnType<typeof getFixtures>>

// ---------------------------------------------------------------------------
// All-time (`/all-time`)
// ---------------------------------------------------------------------------

export interface AllTimeRow {
  playerId: number
  username: string
  avatar: string | null
  points: number
  wins: number
  draws: number
  losses: number
  forfeits: number
  played: number
  seasonsPlayed: number
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
  const current = await getOrCreateCurrentSeason()
  await recomputeStandingsIfStale(current.id)

  const seasonList = (
    await db.select().from(seasons).orderBy(asc(seasons.startedAt))
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
      avatar: players.avatar,
      points: sql<number>`sum(${seasonStandings.points})::int`,
      wins: sql<number>`sum(${seasonStandings.wins})::int`,
      draws: sql<number>`sum(${seasonStandings.draws})::int`,
      losses: sql<number>`sum(${seasonStandings.losses})::int`,
      forfeits: sql<number>`sum(${seasonStandings.forfeits})::int`,
      seasonsPlayed: sql<number>`count(distinct ${seasonStandings.seasonId})::int`,
    })
    .from(seasonStandings)
    .innerJoin(players, eq(players.id, seasonStandings.playerId))
    .groupBy(seasonStandings.playerId, players.username, players.avatar)

  const breakdown = await db.select().from(seasonStandings)

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

export type AllTimeData = Awaited<ReturnType<typeof getAllTime>>

// ---------------------------------------------------------------------------
// Player profile (`/players/$username`)
// ---------------------------------------------------------------------------

export async function getPlayer(username: string) {
  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.username, username.toLowerCase()))
    .limit(1)

  if (!player) return null

  const current = await getOrCreateCurrentSeason()
  const now = new Date()
  await recomputeStandingsIfStale(current.id, now)

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
        forfeits: seasonStandings.forfeits,
      })
      .from(seasonStandings)
      .innerJoin(seasons, eq(seasons.id, seasonStandings.seasonId))
      .where(eq(seasonStandings.playerId, player.id))
      .orderBy(desc(seasons.startedAt))
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
      counts: row.matchday !== null,
    }
  })

  // The player's own fixtures this season, so their profile doubles as a
  // personal schedule.
  const mine = (await seasonFixtures(current.id))
    .filter(
      (f) =>
        f.homeId === player.id || f.awayId === player.id || f.byeId === player.id,
    )
    .map((f) => toView(f, now))

  const totals = history.reduce(
    (acc, season) => ({
      points: acc.points + season.points,
      wins: acc.wins + season.wins,
      draws: acc.draws + season.draws,
      losses: acc.losses + season.losses,
      forfeits: acc.forfeits + season.forfeits,
    }),
    { points: 0, wins: 0, draws: 0, losses: 0, forfeits: 0 },
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
    fixtures: mine,
    totals: { ...totals, played: totals.wins + totals.draws + totals.losses },
    now: now.getTime(),
  }
}

export type PlayerData = NonNullable<Awaited<ReturnType<typeof getPlayer>>>
