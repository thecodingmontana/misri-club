import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'
import { generateNanoId } from './utils.ts'

/** A player's word on a result, waiting for their opponent to confirm it. */
export type MatchReport = {
  byUserId: string
  result: 'white' | 'black' | 'draw'
  homeWhite: boolean
}

/**
 * Every table here has RLS enabled with **no policies**, which is a deny-all.
 *
 * This matters on Supabase specifically: PostgREST exposes the `public` schema
 * over the project's anon key, and the default grants let `anon` read and write
 * any table that has RLS switched off. Tables created by a migration don't get
 * RLS automatically the way dashboard-created ones do, so without this every
 * competition would be world-writable at `/rest/v1/competitions`. The app itself connects
 * as `postgres`, which bypasses RLS, so nothing in our own access path changes.
 */

/** Millisecond precision is plenty for match windows, and cheaper than the µs default. */
const ts = (name: string) =>
  timestamp(name, { mode: 'date', precision: 3, withTimezone: true })

/**
 * Small key/value scratchpad for job bookkeeping (`sync:lastRunAt`, the sync
 * claim, cached club metadata, sign-in attempt counts). Not part of the
 * competition model.
 */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: ts('updated_at').notNull(),
}).enableRLS()

// ---------------------------------------------------------------------------
// Accounts (Better Auth). Field names are Better Auth's own; the adapter maps
// them by these keys. RLS stays on: session tokens must never reach PostgREST.
// ---------------------------------------------------------------------------

const createdAt = () => ts('created_at').defaultNow().notNull()
const updatedAt = () =>
  ts('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date())

export const user = pgTable('user', {
  id: varchar('id', { length: 16 })
    .primaryKey()
    .$defaultFn(() => generateNanoId()),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  /** Finished onboarding without linking chess.com (they skipped that step). */
  onboardedAt: ts('onboarded_at'),
  /** Bumped by "Reset link": calendar links signed for an older version stop working. */
  calendarVersion: integer('calendar_version').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS()

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
).enableRLS()

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
).enableRLS()

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
).enableRLS()

export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true),
    failedVerificationCount: integer('failed_verification_count').default(0),
    lockedUntil: ts('locked_until'),
  },
  (t) => [
    index('two_factor_secret_idx').on(t.secret),
    index('two_factor_user_id_idx').on(t.userId),
  ],
).enableRLS()

/**
 * Better Auth's signing keys for the short-lived tokens PowerSync checks (its
 * jwt plugin). Private keys are stored encrypted with BETTER_AUTH_SECRET.
 */
export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: ts('created_at').notNull(),
  expiresAt: ts('expires_at'),
  alg: text('alg'),
  crv: text('crv'),
}).enableRLS()

export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: ts('created_at'),
  },
  (t) => [
    index('passkey_user_id_idx').on(t.userId),
    index('passkey_credential_id_idx').on(t.credentialID),
  ],
).enableRLS()

/**
 * Request counters for Better Auth's rate limit, in Postgres so a limit holds
 * across every Vercel instance. Better Auth prunes rows older than its longest
 * window (a minute), so our own longer budgets live in `allowance` below.
 */
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
}).enableRLS()

/** Our own budgets (`takeAllowance`): per hour, per day, keyed by purpose. */
export const allowance = pgTable('allowance', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
}).enableRLS()

/**
 * A chess.com account its owner has proven is theirs (code in their profile).
 * One per user, and a username can belong to only one user. Codes waiting to
 * be checked live in `verification`, not here.
 */
export const chessAccounts = pgTable('chess_accounts', {
  id: varchar('id', { length: 16 })
    .primaryKey()
    .$defaultFn(() => generateNanoId()),
  userId: varchar('user_id', { length: 16 })
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** chess.com username, lowercase (the API's own form) */
  username: text('username').notNull().unique(),
  verifiedAt: ts('verified_at').notNull(),
  /** chess.com picture: null = not looked up yet, '' = the player has none */
  avatar: text('avatar'),
}).enableRLS()

// ---------------------------------------------------------------------------
// Competitions: leagues (round-robin) and knockouts, each owned by one player.
// ---------------------------------------------------------------------------

/** Where results come from: chess.com games, or the players and organiser. */
export const resultSource = pgEnum('result_source', ['chesscom', 'manual'])

export const competitionFormat = pgEnum('competition_format', [
  'league',
  'knockout',
  'challenge',
  'groups',
])
export const competitionStatus = pgEnum('competition_status', [
  'open',
  'running',
  'finished',
])
export const competitionVisibility = pgEnum('competition_visibility', [
  'public',
  'private',
])
/** What happens to a match nobody played; see `UnplayedRule`. */
export const unplayedRule = pgEnum('unplayed_rule', [
  'organiser',
  'both_forfeit',
  'void',
])
/** What happens to a league player's games when they leave after the start. */
export const leaveRule = pgEnum('leave_rule', ['award', 'void', 'keep'])
/** Leagues: what happens when a round finishes early; see lib/early-rounds. */
export const earlyRounds = pgEnum('early_rounds', ['wait', 'auto', 'organiser'])
export const matchResult = pgEnum('match_result', ['white', 'black', 'draw'])

export const competitions = pgTable('competitions', {
  id: varchar('id', { length: 16 })
    .primaryKey()
    .$defaultFn(() => generateNanoId()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** normalizeName(name): names are unique ignoring case and spacing */
  nameKey: text('name_key').notNull().unique(),
  format: competitionFormat('format').notNull(),
  /** 1 = everyone meets once, 2 = home and away (leagues only) */
  legs: integer('legs').notNull().default(1),
  /** Groups then knockout: how many groups, and how many of each go through. */
  groupCount: integer('group_count').notNull().default(2),
  advancing: integer('advancing').notNull().default(2),
  /** Challenges: best of how many games (1, 3, 5, 7). */
  bestOf: integer('best_of').notNull().default(1),
  /** How long each round stays open for its games. */
  matchdayDays: integer('matchday_days').notNull().default(2),
  /** chesscom = results sync from chess.com; manual = players report them */
  resultSource: resultSource('result_source').notNull().default('chesscom'),
  status: competitionStatus('status').notNull().default('open'),
  /** public = listed for anyone to join; private = invite code only */
  visibility: competitionVisibility('visibility').notNull().default('private'),
  /** Leagues only: players may still join once it is running. */
  allowLateEntry: boolean('allow_late_entry').notNull().default(false),
  /** Joining needs the organiser's yes (a request) instead of being instant. */
  requireApproval: boolean('require_approval').notNull().default(false),
  /** Most players it takes; null = no limit. */
  maxPlayers: integer('max_players'),
  /** The organiser's rule for matches that expire unplayed. */
  unplayedRule: unplayedRule('unplayed_rule').notNull().default('organiser'),
  /** Older competitions count walkover wins in the "most wins" tie-break; new ones only board wins. */
  walkoverWinsBreakTies: boolean('walkover_wins_break_ties')
    .notNull()
    .default(false),
  /** Leagues: award / void / keep a leaver's games (see lib/leave). */
  leaveRule: leaveRule('leave_rule').notNull().default('award'),
  /** Leagues: how a tie on points breaks, in order (server/standings TIE_BREAKS). */
  tieBreaks: jsonb('tie_breaks')
    .$type<Array<'wins' | 'forfeits' | 'headToHead'>>()
    .notNull()
    .default(['wins', 'forfeits', 'headToHead']),
  /** Optional: the daily cron starts it on this morning if the organiser hasn't. */
  startsAt: ts('starts_at'),
  /** "any", a speed or an exact clock (lib/time-control); only fitting games count. */
  timeControl: text('time_control').notNull().default('any'),
  /** Leagues: open the next round early when everyone has played. */
  earlyRounds: earlyRounds('early_rounds').notNull().default('organiser'),
  /** Leagues: what a win, draw, loss and forfeit are worth. */
  points: jsonb('points')
    .$type<{ win: number; draw: number; loss: number; forfeit: number }>()
    .notNull()
    .default({ win: 3, draw: 1, loss: 0, forfeit: -1 }),
  ownerId: varchar('owner_id', { length: 16 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  inviteCode: text('invite_code').notNull().unique(),
  createdAt: createdAt(),
  startedAt: ts('started_at'),
  finishedAt: ts('finished_at'),
  /** Who won it, set when it finishes. */
  championUserId: varchar('champion_user_id', { length: 16 }).references(
    () => user.id,
    { onDelete: 'set null' },
  ),
  /** Last chess.com results sync, so page views don't hammer the API. */
  syncedAt: ts('synced_at'),
  /** chess.com read in full up to here: a deadline after it isn't settled yet */
  readThrough: ts('read_through'),
}).enableRLS()

export const competitionMembers = pgTable(
  'competition_members',
  {
    competitionId: varchar('competition_id', { length: 16 })
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    joinedAt: ts('joined_at').defaultNow().notNull(),
    /** knockout seeding the organiser set (1 = top); null falls back to join order */
    seed: integer('seed'),
    /** groups then knockout: which group (0 = A); null before the draw */
    groupNo: integer('group_no'),
  },
  (t) => [
    primaryKey({ columns: [t.competitionId, t.userId] }),
    // "my competitions" looks members up by user
    index('competition_members_user_idx').on(t.userId),
  ],
).enableRLS()

/** Asked to join a competition that needs the organiser's approval. */
export const competitionRequests = pgTable(
  'competition_requests',
  {
    competitionId: varchar('competition_id', { length: 16 })
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.userId] })],
).enableRLS()

/**
 * Who can't come back: players who left after the start (leaving settles
 * their games) and anyone the organiser took out. Leaving on your own before
 * the start leaves no record.
 */
export const competitionLeavers = pgTable(
  'competition_leavers',
  {
    competitionId: varchar('competition_id', { length: 16 })
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    leftAt: ts('left_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.userId] })],
).enableRLS()

export const matches = pgTable(
  'matches',
  {
    id: varchar('id', { length: 16 })
      .primaryKey()
      .$defaultFn(() => generateNanoId()),
    competitionId: varchar('competition_id', { length: 16 })
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    /** Order within its round: tie 1 and 2 feed the next round's tie 1, and so on. */
    position: integer('position').notNull().default(0),
    leg: integer('leg').notNull().default(1),
    /** groups then knockout: the group's game (0 = A); null = a knockout game */
    groupNo: integer('group_no'),
    homeUserId: varchar('home_user_id', { length: 16 }).references(
      () => user.id,
      { onDelete: 'set null' },
    ),
    awayUserId: varchar('away_user_id', { length: 16 }).references(
      () => user.id,
      { onDelete: 'set null' },
    ),
    byeUserId: varchar('bye_user_id', { length: 16 }).references(
      () => user.id,
      { onDelete: 'set null' },
    ),
    /** The window a game must finish inside to count for this match. */
    opensAt: ts('opens_at').notNull(),
    dueAt: ts('due_at').notNull(),
    result: matchResult('result'),
    whiteUserId: varchar('white_user_id', { length: 16 }).references(
      () => user.id,
      { onDelete: 'set null' },
    ),
    gameUrl: text('game_url'),
    endedAt: ts('ended_at'),
    /** Called off by the organiser (or the "no result" rule): counts for nobody. */
    voided: boolean('voided').notNull().default(false),
    /** A player's reported result, waiting for the opponent to confirm. */
    report: jsonb('report').$type<MatchReport>(),
    /** A late joiner's game: late games share one round while it's open. */
    late: boolean('late').notNull().default(false),
    /** The organiser's word on a decision, shown on the match card. */
    note: text('note'),
    /** When the 24-hour reminder went out; null until then (sent once). */
    remindedAt: ts('reminded_at'),
    /** Who goes through (knockout), or who was awarded a walkover. */
    winnerUserId: varchar('winner_user_id', { length: 16 }).references(
      () => user.id,
      { onDelete: 'set null' },
    ),
  },
  (t) => [index('matches_competition_round_idx').on(t.competitionId, t.round)],
).enableRLS()

/** Everything we told someone, for the inbox; pushes are copies of these. */
export const notifications = pgTable(
  'notifications',
  {
    id: varchar('id', { length: 16 })
      .primaryKey()
      .$defaultFn(() => generateNanoId()),
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body'),
    url: text('url').notNull(),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)],
).enableRLS()

/** A browser or phone that turned on push; one row per device. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: varchar('id', { length: 16 })
      .primaryKey()
      .$defaultFn(() => generateNanoId()),
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** the sign-in that turned it on: signing out or ending it drops the device */
    sessionId: text('session_id').references(() => session.id, {
      onDelete: 'cascade',
    }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
).enableRLS()

export type Competition = typeof competitions.$inferSelect
export type Match = typeof matches.$inferSelect

/** Stockfish's verdict on one position: centipawns or mate-in, and its best move. */
export type EngineScore = ({ cp: number } | { mate: number }) & {
  best?: string
}

/**
 * Engine analysis of a game, kept with the player's account so another device
 * doesn't analyse it again. A finished game never changes, so neither does this.
 */
export const gameAnalyses = pgTable(
  'game_analyses',
  {
    userId: varchar('user_id', { length: 16 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gameUrl: text('game_url').notNull(),
    scores: jsonb('scores').$type<EngineScore[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameUrl] })],
).enableRLS()
