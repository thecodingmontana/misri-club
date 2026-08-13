import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from 'drizzle-orm'
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
import { KNOWN_MEMBERS } from './club-roster'

/**
 * Scoring. A fixture that expires unplayed costs **both** players a point —
 * chess.com's public API carries no challenge or decline data, so there is no
 * honest way to decide which of the two failed to arrange it. Punishing both is
 * the only rule the available data supports, and it still makes ducking a game
 * strictly worse than losing one.
 */
export const POINTS = { win: 3, draw: 1, loss: 0, forfeit: -1 } as const

export const DEFAULT_MATCHDAY_DAYS = 2
const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

/** The open season (`endedAt IS NULL`), creating "Season 1" on a fresh database. */
export async function getOrCreateCurrentSeason() {
  const [open] = await db
    .select()
    .from(seasons)
    .where(isNull(seasons.endedAt))
    .orderBy(desc(seasons.startedAt))
    .limit(1)

  if (open) return open

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasons)

  const [created] = await db
    .insert(seasons)
    .values({ label: `Season ${n + 1}`, startedAt: new Date() })
    .returning()

  return created
}

export async function getCurrentSeason() {
  const [open] = await db
    .select()
    .from(seasons)
    .where(isNull(seasons.endedAt))
    .orderBy(desc(seasons.startedAt))
    .limit(1)

  return open ?? null
}

/**
 * Closes the open season and opens the next one. Nothing is deleted — the old
 * season's fixtures, games and standings rows *are* the archive.
 */
export async function startNewSeason() {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(seasons)
      .where(isNull(seasons.endedAt))
      .limit(1)

    if (current) {
      await tx
        .update(seasons)
        .set({ endedAt: new Date() })
        .where(eq(seasons.id, current.id))
    }

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(seasons)

    const [created] = await tx
      .insert(seasons)
      .values({ label: `Season ${n + 1}`, startedAt: new Date() })
      .returning()

    return created
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

  const inserted = await db
    .insert(players)
    .values({
      username,
      displayName: profile?.url?.split('/').pop() ?? username,
      avatar: profile?.avatar ?? null,
      joinedAt,
      active: true,
    })
    .onConflictDoNothing()
    .returning({ id: players.id })

  return inserted.length > 0
}

/**
 * Reconciles the `players` table against the club's current membership.
 * Members who have left are flagged inactive rather than deleted, so their
 * games and standings stay intact.
 *
 * chess.com only exposes `/club/{id}/members` for **public** clubs. When the
 * club is private we cannot enumerate it, so we hold the roster we already have
 * (never deactivating anyone on the strength of a list we couldn't read), seed
 * the club admins on a cold start, and let an admin add the rest by username.
 */
export async function refreshRoster(): Promise<RosterRefreshResult> {
  const club = await fetchClub()
  if (!club) {
    throw new Error(`Club "${CLUB_ID}" was not found on chess.com.`)
  }

  await setMeta('club:visibility', club.visibility)
  await setMeta('club:membersCount', String(club.membersCount))
  await setMeta('club:name', club.name)
  if (club.createdAt) {
    await setMeta('club:createdAt', club.createdAt.toISOString())
  }

  const { visible, members } = await fetchClubMembers()

  const existing = await db.select().from(players)
  const byUsername = new Map(existing.map((p) => [p.username, p]))

  const added: Array<string> = []
  const reactivated: Array<string> = []

  if (!visible) {
    // Private club: fall back to the membership we maintain by hand, plus the
    // admins chess.com does name. Additive only — nobody is deactivated on the
    // strength of a list we couldn't read from the API.
    const fallback = new Map<string, Date>()

    for (const member of KNOWN_MEMBERS) {
      fallback.set(member.username.toLowerCase(), new Date(member.joinedAt))
    }
    for (const admin of club.admins) {
      if (!fallback.has(admin)) {
        fallback.set(admin, club.createdAt ?? new Date())
      }
    }

    for (const [username, joinedAt] of fallback) {
      const current = byUsername.get(username)

      if (!current) {
        if (await insertPlayer(username, joinedAt)) added.push(username)
        continue
      }

      if (!current.active) {
        await db
          .update(players)
          .set({ active: true })
          .where(eq(players.id, current.id))
        reactivated.push(username)
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
 */
export async function addPlayerByUsername(rawUsername: string) {
  const username = rawUsername.trim().toLowerCase()
  if (!username) throw new Error('Enter a chess.com username.')

  const [existing] = await db
    .select()
    .from(players)
    .where(eq(players.username, username))
    .limit(1)

  if (existing) {
    if (!existing.active) {
      await db
        .update(players)
        .set({ active: true })
        .where(eq(players.id, existing.id))
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

  const updated = await db
    .update(players)
    .set({ active })
    .where(eq(players.username, username))
    .returning({ id: players.id })

  if (updated.length === 0) throw new Error(`${username} is not on the roster.`)
  return { username, active }
}

export async function listActivePlayers() {
  return db
    .select()
    .from(players)
    .where(eq(players.active, true))
    .orderBy(asc(players.username))
}

export async function listAllPlayers() {
  return db.select().from(players).orderBy(asc(players.username))
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A season locks as soon as one of its fixtures has a game attached — fixtures
 * are immutable once anyone has actually played.
 */
export async function isSeasonLocked(seasonId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(games)
    .where(and(eq(games.seasonId, seasonId), isNotNull(games.fixtureId)))

  return (row?.n ?? 0) > 0
}

export async function hasFixtures(seasonId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fixtures)
    .where(eq(fixtures.seasonId, seasonId))

  return (row?.n ?? 0) > 0
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
  startsAt: number
  endsAt: number
}

/**
 * Builds the season's full two-leg schedule from the currently active roster
 * and stamps each matchday with its playing window. The clock starts the moment
 * the draw is made: matchday 1 opens now, and each subsequent matchday opens as
 * the previous one closes.
 *
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
  const windowMs = season.matchdayDays * DAY_MS
  const base = Date.now()

  const rows = schedule.map((f) => ({
    seasonId: season.id,
    matchday: f.matchday,
    leg: f.leg,
    homePlayerId: f.homeId,
    awayPlayerId: f.awayId,
    byePlayerId: f.byeId,
    opensAt: new Date(base + (f.matchday - 1) * windowMs),
    dueAt: new Date(base + f.matchday * windowMs),
  }))

  await db.transaction(async (tx) => {
    // Regenerating: detach any games first so the old fixture rows can go, then
    // re-link them against the new schedule below.
    await tx
      .update(games)
      .set({ fixtureId: null })
      .where(eq(games.seasonId, season.id))

    await tx.delete(fixtures).where(eq(fixtures.seasonId, season.id))
    await tx.insert(fixtures).values(rows)
  })

  await linkGamesToFixtures(season.id)
  await recomputeStandings(season.id)

  const matchdays = schedule.reduce((max, f) => Math.max(max, f.matchday), 0)

  return {
    seasonId: season.id,
    matchdays,
    fixtures: schedule.length,
    playerCount: roster.length,
    startsAt: base,
    endsAt: base + matchdays * windowMs,
  }
}

/**
 * Attaches games to the fixture they belong to: same pairing, and finished
 * inside that fixture's window. A game between two members played outside any
 * window stays unlinked — it shows in the feed as a friendly but does not score,
 * otherwise the deadlines would mean nothing and players could farm points by
 * replaying the same opponent.
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
    .orderBy(asc(fixtures.matchday), asc(fixtures.leg))

  const linkedRows = await db
    .select({ fixtureId: games.fixtureId })
    .from(games)
    .where(and(eq(games.seasonId, seasonId), isNotNull(games.fixtureId)))

  const taken = new Set(linkedRows.map((row) => row.fixtureId as number))

  const unlinked = await db
    .select()
    .from(games)
    .where(and(eq(games.seasonId, seasonId), isNull(games.fixtureId)))
    .orderBy(asc(games.endedAt))

  let linked = 0

  for (const game of unlinked) {
    const match = openFixtures.find(
      (f) =>
        !taken.has(f.id) &&
        game.endedAt >= f.opensAt &&
        game.endedAt <= f.dueAt &&
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
    taken.add(match.id)
    linked++
  }

  return linked
}

/** Active players with no fixture in this season (joined after the draw). */
export async function unscheduledPlayers(seasonId: number) {
  const rows = await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.seasonId, seasonId))

  const scheduled = new Set<number>()
  for (const f of rows) {
    if (f.homePlayerId) scheduled.add(f.homePlayerId)
    if (f.awayPlayerId) scheduled.add(f.awayPlayerId)
    if (f.byePlayerId) scheduled.add(f.byePlayerId)
  }

  if (scheduled.size === 0) return []
  const roster = await listActivePlayers()
  return roster.filter((p) => !scheduled.has(p.id))
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

/**
 * Rebuilds a season's standings from its fixtures and games.
 *
 * Standings depend on the clock — a fixture expiring changes the table with no
 * write having happened anywhere — so this runs on read as well as after a
 * sync. It is idempotent and cheap, which is precisely why the app needs no
 * background job to enforce deadlines.
 */
export async function recomputeStandings(
  seasonId: number,
  now = new Date(),
): Promise<void> {
  const seasonFixtures = await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.seasonId, seasonId))

  const seasonGames = await db
    .select()
    .from(games)
    .where(and(eq(games.seasonId, seasonId), isNotNull(games.fixtureId)))

  const gameByFixture = new Map(
    seasonGames.map((game) => [game.fixtureId as number, game]),
  )

  const tally = new Map<
    number,
    {
      points: number
      wins: number
      draws: number
      losses: number
      forfeits: number
    }
  >()

  const row = (playerId: number) => {
    let entry = tally.get(playerId)
    if (!entry) {
      entry = { points: 0, wins: 0, draws: 0, losses: 0, forfeits: 0 }
      tally.set(playerId, entry)
    }
    return entry
  }

  // Everyone active starts on zero so the board shows the whole field.
  for (const player of await listActivePlayers()) row(player.id)

  for (const fixture of seasonFixtures) {
    if (!fixture.homePlayerId || !fixture.awayPlayerId) continue

    const home = row(fixture.homePlayerId)
    const away = row(fixture.awayPlayerId)
    const game = gameByFixture.get(fixture.id)

    if (!game) {
      // Still open, or not yet started — no consequence until the window shuts.
      if (fixture.dueAt > now) continue

      home.forfeits++
      away.forfeits++
      home.points += POINTS.forfeit
      away.points += POINTS.forfeit
      continue
    }

    const white = game.whitePlayerId === fixture.homePlayerId ? home : away
    const black = white === home ? away : home

    if (game.result === 'draw') {
      white.draws++
      black.draws++
      white.points += POINTS.draw
      black.points += POINTS.draw
      continue
    }

    const [winner, loser] =
      game.result === 'white' ? [white, black] : [black, white]
    winner.wins++
    winner.points += POINTS.win
    loser.losses++
    loser.points += POINTS.loss
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(seasonStandings)
      .where(eq(seasonStandings.seasonId, seasonId))

    if (tally.size === 0) return

    await tx.insert(seasonStandings).values(
      [...tally.entries()].map(([playerId, stats]) => ({
        seasonId,
        playerId,
        ...stats,
      })),
    )
  })

  await setMeta(`standings:computedAt:${seasonId}`, now.toISOString())
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
}

export async function getMeta(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, key))
    .limit(1)

  return row?.value ?? null
}

/**
 * Batched sibling of `getMeta`. Every one of these is a network round trip to
 * the pooler, so reading five keys as five queries costs five times the latency
 * for no reason.
 */
export async function getManyMeta(
  keys: Array<string>,
): Promise<Record<string, string | null>> {
  const rows = await db
    .select()
    .from(appMeta)
    .where(inArray(appMeta.key, keys))

  const found = new Map(rows.map((row) => [row.key, row.value]))
  return Object.fromEntries(keys.map((key) => [key, found.get(key) ?? null]))
}

/**
 * Standings move on their own as fixture windows close, so reads have to keep
 * them honest — but recomputing on *every* read means a full rebuild per page
 * view, which is invisible on a local socket and brutal over a remote pooler.
 *
 * A rebuild is only needed if a window has closed since the last one. That is a
 * single indexed count, and in the common case it lets us skip the rebuild
 * entirely. Sync always recomputes unconditionally, so newly-imported games are
 * never waiting on this check.
 */
export async function recomputeStandingsIfStale(
  seasonId: number,
  now = new Date(),
): Promise<boolean> {
  const key = `standings:computedAt:${seasonId}`
  const last = await getMeta(key)

  if (last) {
    const since = new Date(last)
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(fixtures)
      .where(
        and(
          eq(fixtures.seasonId, seasonId),
          gt(fixtures.dueAt, since),
          lte(fixtures.dueAt, now),
        ),
      )

    if (n === 0) return false
  }

  await recomputeStandings(seasonId, now)
  return true
}
