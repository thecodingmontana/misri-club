import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * Every table here has RLS enabled with **no policies**, which is a deny-all.
 *
 * This matters on Supabase specifically: PostgREST exposes the `public` schema
 * over the project's anon key, and the default grants let `anon` read and write
 * any table that has RLS switched off. Tables created by a migration don't get
 * RLS automatically the way dashboard-created ones do, so without this the whole
 * league would be world-writable at `/rest/v1/players`. The app itself connects
 * as `postgres`, which bypasses RLS, so nothing in our own access path changes.
 */

export const gameResult = pgEnum('game_result', ['white', 'black', 'draw'])
export const gameSource = pgEnum('game_source', ['auto', 'manual'])

/** Millisecond precision is plenty for match windows, and cheaper than the µs default. */
const ts = (name: string) =>
  timestamp(name, { mode: 'date', precision: 3, withTimezone: true })

export const players = pgTable('players', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** chess.com username, canonical (lowercase) casing — the API's own form */
  username: text('username').notNull().unique(),
  /** Display casing as chess.com renders it on the profile URL */
  displayName: text('display_name'),
  avatar: text('avatar'),
  joinedAt: ts('joined_at').notNull(),
  /** false = left the club / inactive. We never delete, so history survives. */
  active: boolean('active').notNull().default(true),
}).enableRLS()

export const seasons = pgTable(
  'seasons',
  {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  label: text('label').notNull(), // e.g. "Season 1"
  startedAt: ts('started_at').notNull(),
  endedAt: ts('ended_at'), // null = current season
  /**
   * How long each matchday stays open. Players have this many days to arrange
   * and finish their fixture before it expires against both of them.
   */
  matchdayDays: integer('matchday_days').notNull().default(2),
  },
  (t) => [
    // At most one open season: every open row indexes the same constant, so
    // two concurrent "create Season 1" requests cannot both succeed.
    uniqueIndex('seasons_one_open_idx')
      .on(sql`(${t.endedAt} is null)`)
      .where(sql`${t.endedAt} is null`),
  ],
).enableRLS()

export const fixtures = pgTable(
  'fixtures',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    matchday: integer('matchday').notNull(),
    leg: integer('leg').notNull(), // 1 or 2
    homePlayerId: integer('home_player_id').references(() => players.id), // null = bye
    awayPlayerId: integer('away_player_id').references(() => players.id), // null = bye
    byePlayerId: integer('bye_player_id').references(() => players.id),
    /**
     * The playing window. A game counts for this fixture only if it finished
     * inside it; once `dueAt` passes with nothing played, the fixture expires
     * and costs both players a point.
     */
    opensAt: ts('opens_at').notNull(),
    dueAt: ts('due_at').notNull(),
    /**
     * Set by an admin when one player turned up and the other did not: the
     * winner takes a win's points and the other takes a forfeit. A played game
     * always overrides it.
     */
    walkoverWinnerId: integer('walkover_winner_id').references(
      () => players.id,
    ),
  },
  (t) => [
    index('fixtures_season_idx').on(t.seasonId, t.matchday),
    // Foreign keys get no index for free in Postgres, and every standings
    // rebuild joins through these.
    index('fixtures_home_idx').on(t.homePlayerId),
    index('fixtures_away_idx').on(t.awayPlayerId),
    // Deadline sweeps ask "which windows closed since I last looked".
    index('fixtures_due_idx').on(t.seasonId, t.dueAt),
  ],
).enableRLS()

export const games = pgTable(
  'games',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    /** null if it's an extra/unscheduled game (a friendly) */
    fixtureId: integer('fixture_id').references(() => fixtures.id),
    /** dedup key — a game is only ever recorded once, so sync is idempotent */
    chessComUrl: text('chess_com_url').notNull().unique(),
    whitePlayerId: integer('white_player_id')
      .notNull()
      .references(() => players.id),
    blackPlayerId: integer('black_player_id')
      .notNull()
      .references(() => players.id),
    result: gameResult('result').notNull(),
    timeClass: text('time_class'),
    endedAt: ts('ended_at').notNull(),
    source: gameSource('source').notNull().default('auto'),
  },
  (t) => [
    index('games_season_idx').on(t.seasonId, t.endedAt.desc()),
    index('games_white_idx').on(t.whitePlayerId),
    index('games_black_idx').on(t.blackPlayerId),
    // One game per fixture. Postgres treats NULLs as distinct, so any number of
    // unlinked friendlies coexist happily.
    uniqueIndex('games_fixture_idx').on(t.fixtureId),
  ],
).enableRLS()

export const seasonStandings = pgTable(
  'season_standings',
  {
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    points: integer('points').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    /** Fixtures that expired unplayed — each one cost this player a point. */
    forfeits: integer('forfeits').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.seasonId, t.playerId] }),
    // The composite PK covers season-first lookups; all-time rolls up by player.
    index('standings_player_idx').on(t.playerId),
  ],
).enableRLS()

/**
 * Every recent chess.com game of a member, against anyone — the raw material
 * for the player page's stats, rating chart and in-browser engine analysis.
 * Stored from the member's point of view, so a game between two members is
 * here twice, once for each of them.
 */
export const playerGames = pgTable(
  'player_games',
  {
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    chessComUrl: text('chess_com_url').notNull(),
    endedAt: ts('ended_at').notNull(),
    timeClass: text('time_class').notNull(),
    rated: boolean('rated').notNull(),
    colour: text('colour', { enum: ['white', 'black'] }).notNull(),
    outcome: text('outcome', { enum: ['win', 'draw', 'loss'] }).notNull(),
    rating: integer('rating'),
    opponent: text('opponent').notNull(),
    opponentRating: integer('opponent_rating'),
    opening: text('opening'),
    pgn: text('pgn').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.chessComUrl] }),
    index('player_games_recent_idx').on(t.playerId, t.endedAt.desc()),
  ],
).enableRLS()

/**
 * Small key/value scratchpad for job bookkeeping (`sync:lastRunAt`, the sync
 * claim, cached club metadata, standings freshness, sign-in attempt counts).
 * Not part of the league model.
 */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: ts('updated_at').notNull(),
}).enableRLS()

export const playersRelations = relations(players, ({ many }) => ({
  standings: many(seasonStandings),
}))

export const seasonsRelations = relations(seasons, ({ many }) => ({
  fixtures: many(fixtures),
  games: many(games),
  standings: many(seasonStandings),
}))

export const fixturesRelations = relations(fixtures, ({ one }) => ({
  season: one(seasons, {
    fields: [fixtures.seasonId],
    references: [seasons.id],
  }),
  home: one(players, {
    fields: [fixtures.homePlayerId],
    references: [players.id],
    relationName: 'fixtureHome',
  }),
  away: one(players, {
    fields: [fixtures.awayPlayerId],
    references: [players.id],
    relationName: 'fixtureAway',
  }),
  bye: one(players, {
    fields: [fixtures.byePlayerId],
    references: [players.id],
    relationName: 'fixtureBye',
  }),
}))

export const gamesRelations = relations(games, ({ one }) => ({
  season: one(seasons, { fields: [games.seasonId], references: [seasons.id] }),
  fixture: one(fixtures, {
    fields: [games.fixtureId],
    references: [fixtures.id],
  }),
  white: one(players, {
    fields: [games.whitePlayerId],
    references: [players.id],
    relationName: 'gameWhite',
  }),
  black: one(players, {
    fields: [games.blackPlayerId],
    references: [players.id],
    relationName: 'gameBlack',
  }),
}))

export const seasonStandingsRelations = relations(
  seasonStandings,
  ({ one }) => ({
    season: one(seasons, {
      fields: [seasonStandings.seasonId],
      references: [seasons.id],
    }),
    player: one(players, {
      fields: [seasonStandings.playerId],
      references: [players.id],
    }),
  }),
)

export type Player = typeof players.$inferSelect
export type Season = typeof seasons.$inferSelect
export type Fixture = typeof fixtures.$inferSelect
export type Game = typeof games.$inferSelect
export type SeasonStanding = typeof seasonStandings.$inferSelect
export type PlayerGame = typeof playerGames.$inferSelect
