import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { generateDoubleRoundRobin } from '#/lib/round-robin'
import { db } from '#/db/client.server'
import {
  appMeta,
  fixtures,
  games,
  players,
  seasonStandings,
  seasons,
} from '#/db/schema'
import {
  CLUB_ID,
  fetchClub,
  fetchClubMembers,
  fetchPlayerProfile,
} from './chesscom.server'

export const POINTS = { win: 3, draw: 1, loss: 0 } as const

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

/** The open season (`endedAt IS NULL`), creating "Season 1" on a fresh database. */
export async function getOrCreateCurrentSeason() {
  const open = await db
    .select()
    .from(seasons)
    .where(isNull(seasons.endedAt))
    .orderBy(sql`${seasons.startedAt} DESC`)
    .limit(1)
    .get()

  if (open) return open

  const count =
    (await db.select({ n: sql<number>`count(*)` }).from(seasons).get())?.n ?? 0

  return db
    .insert(seasons)
    .values({ label: `Season ${count + 1}`, startedAt: new Date() })
    .returning()
    .get()
}

export function getCurrentSeason() {
  return db
    .select()
    .from(seasons)
    .where(isNull(seasons.endedAt))
    .orderBy(sql`${seasons.startedAt} DESC`)
    .limit(1)
    .get()
}

/**
 * Closes the open season and opens the next one. Nothing is deleted — the old
 * season's fixtures, games and standings rows *are* the archive.
 */
export function startNewSeason() {
  return db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(seasons)
      .where(isNull(seasons.endedAt))
      .get()

    if (current) {
      await tx
        .update(seasons)
        .set({ endedAt: new Date() })
        .where(eq(seasons.id, current.id))
        .run()
    }

    const count =
      (await tx.select({ n: sql<number>`count(*)` }).from(seasons).get())?.n ??
      0

    return tx
      .insert(seasons)
      .values({ label: `Season ${count + 1}`, startedAt: new Date() })
      .returning()
      .get()
  })
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export interface RosterRefreshResult {
  added: Array<string>
  reactivated: Array<string>
  deactivated: Array<string>
  /** false when chess.com won't serve the member list (private club) */
  membersVisible: boolean
  clubVisibility: string
  membersCount: number
  total: number
}

async function insertPlayer(username: string, joinedAt: Date): Promise<boolean> {
  const profile = await fetchPlayerProfile(username).catch(() => null)

  const result = await db
    .insert(players)
    .values({
      username,
      displayName: profile?.url?.split('/').pop() ?? username,
      avatar: profile?.avatar ?? null,
      joinedAt,
      active: true,
    })
    .onConflictDoNothing()
    .run()

  return result.rowsAffected > 0
}

/**
 * Reconciles the `players` table against the club's current membership.
 * Members who have left are flagged inactive rather than deleted, so their
 * games and standings stay intact.
 *
 * chess.com only exposes `/club/{id}/members` for **public** clubs. When the
 * club is private we cannot enumerate it, so we hold the roster we already have
 * (never deactivating anyone on the strength of a list we couldn't read), seed
 * the club admins on a cold start, and let an admin add the rest by username —
 * every other endpoint we need is public per-player and works regardless.
 */
export async function refreshRoster(): Promise<RosterRefreshResult> {
  const club = await fetchClub()
  if (!club) {
    throw new Error(`Club "${CLUB_ID}" was not found on chess.com.`)
  }

  await setMeta('club:visibility', club.visibility)
  await setMeta('club:membersCount', String(club.membersCount))
  await setMeta('club:name', club.name)
  if (club.createdAt) await setMeta('club:createdAt', club.createdAt.toISOString())

  const { visible, members } = await fetchClubMembers()

  const existing = await db.select().from(players).all()
  const byUsername = new Map(existing.map((p) => [p.username, p]))

  const added: Array<string> = []
  const reactivated: Array<string> = []

  if (!visible) {
    // Private club: the admins are the only members chess.com will name, and
    // only when the roster is otherwise empty is it worth seeding them.
    if (existing.length === 0) {
      for (const admin of club.admins) {
        if (await insertPlayer(admin, club.createdAt ?? new Date())) {
          added.push(admin)
        }
      }
    }

    return {
      added,
      reactivated,
      deactivated: [],
      membersVisible: false,
      clubVisibility: club.visibility,
      membersCount: club.membersCount,
      total: existing.length + added.length,
    }
  }

  for (const member of members) {
    const current = byUsername.get(member.username)

    if (!current) {
      if (await insertPlayer(member.username, member.joinedAt)) {
        added.push(member.username)
      }
      continue
    }

    if (!current.active) {
      await db
        .update(players)
        .set({ active: true })
        .where(eq(players.id, current.id))
        .run()
      reactivated.push(current.username)
    }
  }

  const memberNames = new Set(members.map((m) => m.username))
  const deactivated = existing
    .filter((p) => p.active && !memberNames.has(p.username))
    .map((p) => p.username)

  if (deactivated.length > 0) {
    await db
      .update(players)
      .set({ active: false })
      .where(inArray(players.username, deactivated))
      .run()
  }

  return {
    added,
    reactivated,
    deactivated,
    membersVisible: true,
    clubVisibility: club.visibility,
    membersCount: club.membersCount,
    total: members.length,
  }
}

/**
 * Adds a club member by username — the manual path for private clubs, where
 * chess.com won't enumerate the roster for us. The username is verified against
 * chess.com before it lands in the table.
 *
 * `joinedAt` defaults to the club's creation date, so games the pair played
 * before the club existed don't retroactively count towards the league.
 */
export async function addPlayerByUsername(rawUsername: string) {
  const username = rawUsername.trim().toLowerCase()
  if (!username) throw new Error('Enter a chess.com username.')

  const existing = await db
    .select()
    .from(players)
    .where(eq(players.username, username))
    .get()

  if (existing) {
    if (!existing.active) {
      await db
        .update(players)
        .set({ active: true })
        .where(eq(players.id, existing.id))
        .run()
      return { username, status: 'reactivated' as const }
    }
    throw new Error(`${username} is already on the roster.`)
  }

  const profile = await fetchPlayerProfile(username)
  if (!profile) {
    throw new Error(`No chess.com account called "${username}".`)
  }

  const clubCreated = await getMeta('club:createdAt')
  await insertPlayer(username, clubCreated ? new Date(clubCreated) : new Date())

  return { username, status: 'added' as const }
}

/** Flags a player inactive; their games and standings are untouched. */
export async function setPlayerActive(rawUsername: string, active: boolean) {
  const username = rawUsername.trim().toLowerCase()
  const result = await db
    .update(players)
    .set({ active })
    .where(eq(players.username, username))
    .run()

  if (result.rowsAffected === 0)
    throw new Error(`${username} is not on the roster.`)
  return { username, active }
}

export function listActivePlayers() {
  return db.select().from(players).where(eq(players.active, true)).all()
}

export function listAllPlayers() {
  return db.select().from(players).orderBy(players.username).all()
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A season locks as soon as one of its fixtures has a game attached — fixtures
 * are immutable once anyone has actually played.
 */
export async function isSeasonLocked(seasonId: number): Promise<boolean> {
  const played = await db
    .select({ n: sql<number>`count(*)` })
    .from(games)
    .where(and(eq(games.seasonId, seasonId), isNotNull(games.fixtureId)))
    .get()

  return (played?.n ?? 0) > 0
}

export async function hasFixtures(seasonId: number): Promise<boolean> {
  const n = (
    await db
      .select({ n: sql<number>`count(*)` })
      .from(fixtures)
      .where(eq(fixtures.seasonId, seasonId))
      .get()
  )?.n

  return (n ?? 0) > 0
}

export class SeasonLockedError extends Error {
  constructor() {
    super(
      'Fixtures are locked for this season — a scheduled game has already been played.',
    )
    this.name = 'SeasonLockedError'
  }
}

export interface GenerateFixturesResult {
  seasonId: number
  matchdays: number
  fixtures: number
  playerCount: number
}

/**
 * Builds the season's full two-leg schedule from the currently active roster.
 * Rejected server-side once the season is locked — the disabled button in the
 * UI is a convenience, not the enforcement point.
 */
export async function generateFixtures(): Promise<GenerateFixturesResult> {
  const season = await getOrCreateCurrentSeason()

  if (await isSeasonLocked(season.id)) throw new SeasonLockedError()

  const roster = await listActivePlayers()
  if (roster.length < 2) {
    throw new Error(
      'At least two active club members are needed to generate fixtures.',
    )
  }

  const schedule = generateDoubleRoundRobin(roster.map((p) => p.id))

  await db.transaction(async (tx) => {
    // Regenerating: detach any unscheduled games first so the old fixture rows
    // can go, then re-link them against the new schedule below.
    await tx
      .update(games)
      .set({ fixtureId: null })
      .where(eq(games.seasonId, season.id))
      .run()

    await tx.delete(fixtures).where(eq(fixtures.seasonId, season.id)).run()

    await tx
      .insert(fixtures)
      .values(
        schedule.map((f) => ({
          seasonId: season.id,
          matchday: f.matchday,
          leg: f.leg,
          homePlayerId: f.homeId,
          awayPlayerId: f.awayId,
          byePlayerId: f.byeId,
        })),
      )
      .run()
  })

  await linkGamesToFixtures(season.id)
  await recomputeStandings(season.id)

  return {
    seasonId: season.id,
    matchdays: schedule.length > 0 ? Math.max(...schedule.map((f) => f.matchday)) : 0,
    fixtures: schedule.length,
    playerCount: roster.length,
  }
}

/**
 * Attaches unlinked games to the earliest matching open fixture. A pairing that
 * has no fixture left to fill (an extra game, or a mid-season joiner) simply
 * stays unlinked — it still counts for points.
 */
export async function linkGamesToFixtures(seasonId: number): Promise<number> {
  const openFixtures = await db
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.seasonId, seasonId),
        isNotNull(fixtures.homePlayerId),
        isNotNull(fixtures.awayPlayerId),
      ),
    )
    .orderBy(fixtures.matchday, fixtures.leg)
    .all()

  const taken = new Set(
    (
      await db
        .select({ fixtureId: games.fixtureId })
        .from(games)
        .where(and(eq(games.seasonId, seasonId), isNotNull(games.fixtureId)))
        .all()
    ).map((row) => row.fixtureId as number),
  )

  const unlinked = await db
    .select()
    .from(games)
    .where(and(eq(games.seasonId, seasonId), isNull(games.fixtureId)))
    .orderBy(games.endedAt)
    .all()

  let linked = 0

  for (const game of unlinked) {
    const match = openFixtures.find(
      (f) =>
        !taken.has(f.id) &&
        ((f.homePlayerId === game.whitePlayerId &&
          f.awayPlayerId === game.blackPlayerId) ||
          (f.homePlayerId === game.blackPlayerId &&
            f.awayPlayerId === game.whitePlayerId)),
    )

    if (!match) continue

    await db
      .update(games)
      .set({ fixtureId: match.id })
      .where(eq(games.id, game.id))
      .run()
    taken.add(match.id)
    linked++
  }

  return linked
}

/** Active players with no fixture in this season (joined after the draw). */
export async function unscheduledPlayers(seasonId: number) {
  const scheduled = new Set<number>()
  for (const f of await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.seasonId, seasonId))
    .all()) {
    if (f.homePlayerId) scheduled.add(f.homePlayerId)
    if (f.awayPlayerId) scheduled.add(f.awayPlayerId)
    if (f.byePlayerId) scheduled.add(f.byePlayerId)
  }

  if (scheduled.size === 0) return []
  return (await listActivePlayers()).filter((p) => !scheduled.has(p.id))
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

/**
 * Rebuilds a season's standings from its games. Recomputing rather than
 * incrementing keeps the table self-healing: a corrected result, a deleted
 * game or a re-run sync all converge on the same numbers.
 */
export async function recomputeStandings(seasonId: number): Promise<void> {
  const seasonGames = await db
    .select()
    .from(games)
    .where(eq(games.seasonId, seasonId))
    .all()

  const tally = new Map<
    number,
    { points: number; wins: number; draws: number; losses: number }
  >()

  const row = (playerId: number) => {
    let entry = tally.get(playerId)
    if (!entry) {
      entry = { points: 0, wins: 0, draws: 0, losses: 0 }
      tally.set(playerId, entry)
    }
    return entry
  }

  // Everyone active, plus everyone scheduled this season, starts on zero so the
  // leaderboard shows the whole field rather than only players who have played.
  for (const player of await listActivePlayers()) row(player.id)
  for (const fixture of await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.seasonId, seasonId))
    .all()) {
    if (fixture.homePlayerId) row(fixture.homePlayerId)
    if (fixture.awayPlayerId) row(fixture.awayPlayerId)
  }

  for (const game of seasonGames) {
    const white = row(game.whitePlayerId)
    const black = row(game.blackPlayerId)

    if (game.result === 'draw') {
      white.draws++
      black.draws++
      white.points += POINTS.draw
      black.points += POINTS.draw
      continue
    }

    const [winner, loser] = game.result === 'white' ? [white, black] : [black, white]
    winner.wins++
    winner.points += POINTS.win
    loser.losses++
    loser.points += POINTS.loss
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(seasonStandings)
      .where(eq(seasonStandings.seasonId, seasonId))
      .run()

    if (tally.size === 0) return

    await tx
      .insert(seasonStandings)
      .values(
        [...tally.entries()].map(([playerId, stats]) => ({
          seasonId,
          playerId,
          ...stats,
        })),
      )
      .run()
  })
}

// ---------------------------------------------------------------------------
// Job bookkeeping
// ---------------------------------------------------------------------------

export async function setMeta(key: string, value: string) {
  await db
    .insert(appMeta)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value, updatedAt: new Date() },
    })
    .run()
}

export async function getMeta(key: string): Promise<string | null> {
  return (
    (await db.select().from(appMeta).where(eq(appMeta.key, key)).get())?.value ??
    null
  )
}
