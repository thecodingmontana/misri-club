import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm'
import { db } from '#/db/client.server'
import {
  appMeta,
  fixtures,
  games,
  players,
  seasonStandings,
  seasons,
} from '#/db/schema'
import { generateDoubleRoundRobin } from '#/lib/round-robin'
import {
  CLUB_ID,
  fetchClub,
  fetchClubMembers,
  fetchPlayerProfile,
} from './chesscom.server'
import { KNOWN_MEMBERS } from './club-roster'
import { fitsFixture, tallyStandings } from './standings'

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

  // `seasons_one_open_idx` lets only one concurrent creator win; the rest
  // read back the season it made.
  const [created] = await db
    .insert(seasons)
    .values({ label: `Season ${n + 1}`, startedAt: new Date() })
    .onConflictDoNothing()
    .returning()
  if (created) return created

  const [winner] = await db
    .select()
    .from(seasons)
    .where(isNull(seasons.endedAt))
    .limit(1)
  return winner
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
  /** Listed usernames chess.com does not know — skipped, never inserted. */
  notOnChessCom: Array<string>
}

async function insertPlayer(
  username: string,
  joinedAt: Date,
): Promise<'added' | 'exists' | 'not-on-chess-com'> {
  // The league is built on chess.com data, so a player chess.com has never
  // heard of (a typo in the roster, a closed account) is never inserted.
  // Network errors propagate rather than letting an unverified row through.
  const profile = await fetchPlayerProfile(username)
  if (!profile) return 'not-on-chess-com'

  const inserted = await db
    .insert(players)
    .values({
      username,
      displayName: profile.url?.split('/').pop() ?? username,
      avatar: profile.avatar ?? null,
      joinedAt,
      active: true,
    })
    .onConflictDoNothing()
    .returning({ id: players.id })

  return inserted.length > 0 ? 'added' : 'exists'
}

/**
 * Members whose avatar is missing (they had none, or chess.com was down when
 * they were added) get another look. One profile request per such member.
 */
async function backfillAvatars(existing: Array<typeof players.$inferSelect>) {
  for (const player of existing) {
    if (player.avatar) continue
    const profile = await fetchPlayerProfile(player.username).catch(() => null)
    if (!profile?.avatar) continue
    await db
      .update(players)
      .set({ avatar: profile.avatar })
      .where(eq(players.id, player.id))
  }
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
  const notOnChessCom: Array<string> = []
  const insert = async (username: string, joinedAt: Date) => {
    const outcome = await insertPlayer(username, joinedAt)
    if (outcome === 'added') added.push(username)
    if (outcome === 'not-on-chess-com') notOnChessCom.push(username)
  }

  await backfillAvatars(existing)

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

    // Insert-only: an admin who marks someone inactive must not have the next
    // sync quietly switch them back on.
    for (const [username, joinedAt] of fallback) {
      if (!byUsername.has(username)) await insert(username, joinedAt)
    }

    return {
      added,
      reactivated,
      deactivated: [],
      membersVisible: false,
      clubVisibility: club.visibility,
      membersCount: club.membersCount,
      total: existing.length + added.length,
      notOnChessCom,
    }
  }

  for (const member of members) {
    const current = byUsername.get(member.username)

    if (!current) {
      await insert(member.username, member.joinedAt)
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
    notOnChessCom,
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
      await recomputeCurrentStandings()
      return { username, status: 'reactivated' as const }
    }
    throw new Error(`${username} is already on the roster.`)
  }

  const clubCreated = await getMeta('club:createdAt')
  const outcome = await insertPlayer(
    username,
    clubCreated ? new Date(clubCreated) : new Date(),
  )
  if (outcome === 'not-on-chess-com') {
    throw new Error(`No chess.com account called "${username}".`)
  }

  await recomputeCurrentStandings()
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
  await recomputeCurrentStandings()
  return { username, active }
}

/**
 * Standings depend on who is active (a lapsed fixture against someone who left
 * costs nobody), and the stale check only watches deadlines — so roster
 * changes rebuild the table themselves.
 */
async function recomputeCurrentStandings() {
  const season = await getOrCreateCurrentSeason()
  await recomputeStandings(season.id, new Date(), { wait: true })
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
 * A season locks as soon as one of its fixtures has a result — a game attached
 * or a walkover awarded. Fixtures are immutable once anything has been decided.
 */
export async function isSeasonLocked(seasonId: number): Promise<boolean> {
  const [row] = await db.execute<{ locked: boolean }>(sql`
    select (
      exists (
        select 1 from games
        where season_id = ${seasonId} and fixture_id is not null
      )
      or exists (
        select 1 from fixtures
        where season_id = ${seasonId} and walkover_winner_id is not null
      )
    ) as locked
  `)

  return row?.locked ?? false
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

  if (await isSeasonLocked(season.id)) {
    throw new Error(
      'Fixtures are locked for this season — a scheduled game has already been played.',
    )
  }

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
    // No game is linked here (the season is unlocked), and the foreign key from
    // `games.fixture_id` makes the delete fail if a sync linked one since.
    await tx.delete(fixtures).where(eq(fixtures.seasonId, season.id))
    await tx.insert(fixtures).values(rows)
  })

  await linkGamesToFixtures(season.id)
  await recomputeStandings(season.id, new Date(), { wait: true })

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
      (f) => !taken.has(f.id) && fitsFixture(game, f),
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

/**
 * Awards (or, with `winner: null`, clears) a walkover on a current-season
 * fixture that has no game. The winner must be one of its two players.
 */
export async function setWalkover(fixtureId: number, winner: string | null) {
  const season = await getOrCreateCurrentSeason()

  const [fixture] = await db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.id, fixtureId), eq(fixtures.seasonId, season.id)))
    .limit(1)

  if (!fixture?.homePlayerId || !fixture.awayPlayerId) {
    throw new Error('That fixture is not a pairing in the current season.')
  }

  const [played] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.fixtureId, fixture.id))
    .limit(1)
  if (played) throw new Error('That fixture has already been played.')

  let winnerId: number | null = null
  if (winner) {
    const [player] = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.username, winner.trim().toLowerCase()))
      .limit(1)

    if (
      !player ||
      (player.id !== fixture.homePlayerId && player.id !== fixture.awayPlayerId)
    ) {
      throw new Error(`${winner} is not playing in that fixture.`)
    }
    winnerId = player.id
  }

  await db
    .update(fixtures)
    .set({ walkoverWinnerId: winnerId })
    .where(eq(fixtures.id, fixture.id))

  await recomputeStandings(season.id, new Date(), { wait: true })
  return {
    fixtureId: fixture.id,
    winner: winner?.trim().toLowerCase() ?? null,
  }
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
  /**
   * Writers (sync, walkovers, a new draw) wait for the lock instead of
   * skipping: they hold data a concurrent page read may have missed, so their
   * rebuild must land after it, never be dropped.
   */
  { wait = false }: { wait?: boolean } = {},
): Promise<void> {
  await db.transaction(async (tx) => {
    /**
     * Only one rebuild at a time, per season, and every read happens after the
     * lock: a rebuild that read its rows first could otherwise commit older
     * numbers over a newer rebuild that slipped in between.
     *
     * This runs on every read, so a burst of concurrent requests all see stale
     * standings at once. `pg_try_advisory_xact_lock` returns rather than waits,
     * and is released with the transaction — safe on a transaction-mode pooler,
     * where anything session-scoped would leak onto whichever backend we happen
     * to land on. A page read that loses the race skips: the winner reads rows
     * at least as fresh. Writers pass `wait` and queue behind it instead.
     */
    if (wait) {
      await tx.execute(sql`select pg_advisory_xact_lock(${seasonId})`)
    } else {
      const [lock] = await tx.execute<{ acquired: boolean }>(
        sql`select pg_try_advisory_xact_lock(${seasonId}) as acquired`,
      )
      if (!lock?.acquired) return
    }

    const seasonFixtures = await tx
      .select()
      .from(fixtures)
      .where(eq(fixtures.seasonId, seasonId))

    const seasonGames = await tx
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), isNotNull(games.fixtureId)))

    const active = await tx
      .select({ id: players.id })
      .from(players)
      .where(eq(players.active, true))

    const tally = tallyStandings(
      seasonFixtures,
      seasonGames,
      active.map((player) => player.id),
      now,
    )

    await tx
      .delete(seasonStandings)
      .where(eq(seasonStandings.seasonId, seasonId))

    if (tally.size > 0) {
      await tx.insert(seasonStandings).values(
        [...tally.entries()].map(([playerId, stats]) => ({
          seasonId,
          playerId,
          ...stats,
        })),
      )
    }

    // The watermark commits with the rows it describes.
    const key = `standings:computedAt:${seasonId}`
    const value = now.toISOString()
    await tx
      .insert(appMeta)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appMeta.key,
        set: { value, updatedAt: new Date() },
      })
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
}

/**
 * Claims `key` unless it was claimed less than `windowMs` ago, and returns the
 * milliseconds left to wait (0 = claimed). Check and write are one statement,
 * so across every server instance only one concurrent caller wins.
 */
export async function claimSlot(
  key: string,
  windowMs: number,
): Promise<number> {
  const now = new Date()
  const claimed = await db
    .insert(appMeta)
    .values({ key, value: now.toISOString(), updatedAt: now })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: now.toISOString(), updatedAt: now },
      setWhere: lt(appMeta.updatedAt, new Date(now.getTime() - windowMs)),
    })
    .returning({ key: appMeta.key })
  if (claimed.length > 0) return 0

  const [row] = await db
    .select({ updatedAt: appMeta.updatedAt })
    .from(appMeta)
    .where(eq(appMeta.key, key))
  return row
    ? Math.max(1, row.updatedAt.getTime() + windowMs - now.getTime())
    : 1
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
  const rows = await db.select().from(appMeta).where(inArray(appMeta.key, keys))

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

  // The watermark lookup and the "did anything expire since then" test are one
  // statement on purpose. Split across two queries they cost two round trips of
  // pooler latency on every single page render, which is the dominant cost of a
  // read when the database is a couple of hundred milliseconds away.
  // `db.execute` binds parameters through postgres-js's `unsafe` path, which
  // does not serialise a JS Date the way the tagged-template path does — it
  // throws "must be of type string". Hence the ISO string plus an explicit cast.
  const rows = await db.execute<{ stale: boolean }>(sql`
    select (
      (select value from app_meta where key = ${key}) is null
      or exists (
        select 1 from fixtures
        where season_id = ${seasonId}
          and due_at <= ${now.toISOString()}::timestamptz
          and due_at > (select value from app_meta where key = ${key})::timestamptz
      )
    ) as stale
  `)

  if (!rows[0]?.stale) return false

  await recomputeStandings(seasonId, now)
  return true
}
