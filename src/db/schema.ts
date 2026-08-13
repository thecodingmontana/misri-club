import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** chess.com username, canonical (lowercase) casing — the API's own form */
  username: text('username').notNull().unique(),
  /** Display casing as chess.com renders it on the profile URL */
  displayName: text('display_name'),
  avatar: text('avatar'),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
  /** false = left the club / inactive. We never delete, so history survives. */
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const seasons = sqliteTable('seasons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(), // e.g. "Season 1"
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }), // null = current season
})

export const fixtures = sqliteTable(
  'fixtures',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    matchday: integer('matchday').notNull(),
    leg: integer('leg').notNull(), // 1 or 2
    homePlayerId: integer('home_player_id').references(() => players.id), // null = bye
    awayPlayerId: integer('away_player_id').references(() => players.id), // null = bye
    byePlayerId: integer('bye_player_id').references(() => players.id),
  },
  (t) => [index('fixtures_season_idx').on(t.seasonId, t.matchday)],
)

export const games = sqliteTable(
  'games',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    /** null if it's an extra/unscheduled game */
    fixtureId: integer('fixture_id').references(() => fixtures.id),
    /** dedup key — a game is only ever recorded once, so sync is idempotent */
    chessComUrl: text('chess_com_url').notNull().unique(),
    whitePlayerId: integer('white_player_id')
      .notNull()
      .references(() => players.id),
    blackPlayerId: integer('black_player_id')
      .notNull()
      .references(() => players.id),
    result: text('result', { enum: ['white', 'black', 'draw'] }).notNull(),
    timeClass: text('time_class'),
    endedAt: integer('ended_at', { mode: 'timestamp' }).notNull(),
    source: text('source', { enum: ['auto', 'manual'] })
      .notNull()
      .default('auto'),
  },
  (t) => [
    index('games_season_idx').on(t.seasonId, t.endedAt),
    uniqueIndex('games_fixture_idx').on(t.fixtureId),
  ],
)

export const seasonStandings = sqliteTable(
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
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.playerId] })],
)

/**
 * Small key/value scratchpad for job bookkeeping (e.g. `sync:lastRunAt`).
 * Not part of the league model — it just keeps the UI honest about freshness.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

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
