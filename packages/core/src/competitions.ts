// English only: the root import ships every locale in the server bundle
import { faker } from '@faker-js/faker/locale/en'
import { db } from '@misri/db/client'
import {
  type Competition,
  chessAccounts,
  competitionLeavers,
  competitionMembers,
  competitionRequests,
  competitions,
  matches,
} from '@misri/db/schema'
import { generateInviteCode, generateNanoId } from '@misri/db/utils'
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { authorize, roleOf, type Viewer } from './access.ts'
import { generateKnockoutRound1, knockoutLegs } from './bracket.ts'
import { fetchPlayerRating } from './chesscom.ts'
import {
  normalizeName,
  suggestFrom,
  suggestNames,
} from './competition-names.ts'
import type { EarlyRounds } from './early-rounds.ts'
import { UserError } from './errors.ts'
import { drawGroups, groupsProblem } from './groups.ts'
import {
  canJoin,
  lateRoundWindow,
  missingFixtures,
  type PlannedRound,
  placeLateGames,
} from './join-policy.ts'
import type { LeaveRule } from './leave.ts'
import {
  notifyGamesMoved,
  notifyJoined,
  notifyNewGames,
  notifyRematch,
  notifyRequested,
  notifyScheduledStart,
  notifyStarted,
} from './notifications.ts'
import { generateDoubleRoundRobin } from './round-robin.ts'
import type { Points, TieBreak, UnplayedRule } from './standings.ts'

const DAY = 24 * 60 * 60 * 1000

/** Managing doesn't depend on membership, so the cheap role is enough. */
export function authorizeManage(
  viewer: Viewer,
  competition: Pick<Competition, 'ownerId' | 'visibility'>,
) {
  authorize('manage', {
    role: roleOf(viewer, competition, false),
    isAdmin: viewer.isAdmin,
    visibility: competition.visibility,
  })
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** A catch-up game moved into a scheduled round, for telling its players. */
export type GameMove = {
  homeId: string
  awayId: string
  round: number
  dueAt: Date
}

export interface CompetitionSettings {
  name: string
  format: Competition['format']
  legs: number
  matchdayDays: number
  visibility: Competition['visibility']
  allowLateEntry: boolean
  unplayedRule: UnplayedRule
  leaveRule: LeaveRule
  maxPlayers: number | null
  requireApproval: boolean
  points: Points
  earlyRounds?: EarlyRounds
  bestOf?: number
  groupCount?: number
  advancing?: number
  timeControl?: string
  tieBreaks?: TieBreak[]
  startsAt?: Date | null
  resultSource?: Competition['resultSource']
}

/** Create and join need a verified chess.com account: results come from there. */
export async function requireChessAccount(userId: string) {
  const [linked] = await db
    .select({ username: chessAccounts.username })
    .from(chessAccounts)
    .where(eq(chessAccounts.userId, userId))
    .limit(1)
  if (!linked) throw new UserError('Link your chess.com account first.')
}

/** Knockouts have one leg and never take late entries. */
export function checkFormatRules(settings: {
  format: Competition['format']
  legs?: number
  allowLateEntry?: boolean
  unplayedRule?: UnplayedRule
}) {
  // someone has to go through, so only the organiser can settle an unplayed tie
  if (
    settings.format === 'knockout' &&
    (settings.unplayedRule ?? 'organiser') !== 'organiser'
  ) {
    throw new UserError(
      'In a tournament the organiser decides unplayed matches.',
    )
  }
  if (settings.format === 'knockout' && settings.allowLateEntry) {
    throw new UserError("A tournament can't take late entries.")
  }
  if (settings.format === 'groups' && settings.allowLateEntry) {
    throw new UserError('Groups are drawn at the start; no late entries.')
  }
  if (
    settings.format === 'challenge' &&
    ((settings.unplayedRule ?? 'organiser') !== 'organiser' ||
      settings.allowLateEntry)
  ) {
    throw new UserError(
      'A challenge is just the two of you; you settle unplayed games.',
    )
  }
}

/** Seed order into groups (snake draw), saved on the members; each group's round robin. */
async function drawIntoGroups(tx: Tx, competition: Competition, ids: string[]) {
  const groups = drawGroups(ids, competition.groupCount)
  for (const [groupNo, group] of groups.entries()) {
    await tx
      .update(competitionMembers)
      .set({ groupNo })
      .where(
        and(
          eq(competitionMembers.competitionId, competition.id),
          inArray(competitionMembers.userId, group),
        ),
      )
  }
  return groups.flatMap((group, groupNo) =>
    generateDoubleRoundRobin(group)
      .filter((f) => f.leg <= competition.legs)
      .map((f) => ({
        round: f.matchday,
        leg: f.leg,
        homeId: f.homeId,
        awayId: f.awayId,
        byeId: f.byeId,
        groupNo,
      })),
  )
}

/** Game k of a best-of-N; colours aren't enforced, so home just alternates. */
function challengeGames([a, b]: string[], bestOf: number) {
  return Array.from({ length: bestOf }, (_, i) => ({
    round: i + 1,
    leg: 1,
    homeId: i % 2 === 0 ? a : b,
    awayId: i % 2 === 0 ? b : a,
    byeId: null,
  }))
}

/** A challenge is always two players, invite only, straight in. */
function shapeSettings(requested: CompetitionSettings): CompetitionSettings {
  // a time control filters chess.com games; tracked results have none to filter
  const settings =
    requested.resultSource === 'manual'
      ? { ...requested, timeControl: 'any' }
      : requested
  if (settings.format !== 'challenge') return settings
  return {
    ...settings,
    legs: 1,
    maxPlayers: 2,
    visibility: 'private',
    allowLateEntry: false,
    requireApproval: false,
    unplayedRule: 'organiser',
  }
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return base || 'competition'
}

async function uniqueSlug(name: string) {
  const base = slugify(name)
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug =
      attempt === 0 ? base : `${base}-${generateNanoId().slice(0, 4)}`
    const [taken] = await db
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.slug, slug))
      .limit(1)
    if (!taken) return slug
  }
  return `${base}-${generateNanoId().slice(0, 8)}`
}

const NAME_TAKEN = 'That name is taken.'
const SUGGESTIONS = 3

const capitalise = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1)

/** Fresh one-word adjectives and cities from Faker, mixed with the chess flavours. */
function fakerFlavours() {
  const words = [
    ...faker.helpers.multiple(
      () => faker.word.adjective({ length: { min: 4, max: 9 } }),
      { count: 8 },
    ),
    ...faker.helpers.multiple(() => faker.location.city(), { count: 8 }),
  ]
  // one word each, so names stay short and read like "Brave Rooks Cup"
  return [
    ...new Set(words.filter((w) => /^[A-Za-z]+$/.test(w)).map(capitalise)),
  ]
}

/** Which of `keys` (normalized names) already name a competition. */
export async function takenKeys(keys: string[]) {
  if (!keys.length) return new Set<string>()
  const rows = await db
    .select({ key: competitions.nameKey })
    .from(competitions)
    .where(inArray(competitions.nameKey, keys))
  return new Set(rows.map((row) => row.key))
}

/** Drops names already in use; fine to over-ask since keys are cheap to check. */
async function available(names: string[]) {
  const taken = await takenKeys(names.map(normalizeName))
  return names.filter((name) => !taken.has(normalizeName(name)))
}

export async function suggestCompetitionNames() {
  return (
    await available(
      suggestNames(SUGGESTIONS * 3, new Set(), Date.now(), fakerFlavours()),
    )
  ).slice(0, SUGGESTIONS)
}

export async function checkCompetitionName(name: string) {
  const key = normalizeName(name)
  if (!(await takenKeys([key])).size)
    return { available: true, suggestions: [] }
  const close = await available(
    suggestFrom(
      name,
      SUGGESTIONS * 3,
      new Set([key]),
      Date.now(),
      fakerFlavours(),
    ),
  )
  return { available: false, suggestions: close.slice(0, SUGGESTIONS) }
}

export function isNameClash(error: unknown) {
  const { code, constraint_name } =
    (error as { cause?: { code?: string; constraint_name?: string } }).cause ??
    (error as { code?: string; constraint_name?: string })
  return code === '23505' && constraint_name === 'competitions_name_key_unique'
}

export async function createCompetition(
  ownerId: string,
  requested: CompetitionSettings,
) {
  const settings = shapeSettings(requested)
  checkFormatRules(settings)
  const nameKey = normalizeName(settings.name)
  if ((await takenKeys([nameKey])).size) throw new UserError(NAME_TAKEN)
  const slug = await uniqueSlug(settings.name)
  // Two creates with one name at once: the unique key turns away the second.
  await createRows(ownerId, settings, nameKey, slug).catch((error) => {
    throw isNameClash(error) ? new UserError(NAME_TAKEN) : error
  })
  return slug
}

async function createRows(
  ownerId: string,
  settings: CompetitionSettings,
  nameKey: string,
  slug: string,
) {
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(competitions)
      .values({
        ...settings,
        nameKey,
        legs: settings.format === 'knockout' ? 1 : settings.legs,
        slug,
        ownerId,
        inviteCode: generateInviteCode(),
      })
      .returning({ id: competitions.id })
    await tx
      .insert(competitionMembers)
      .values({ competitionId: created.id, userId: ownerId })
  })
}

/** The competition row, locked until the transaction ends. */
export async function lockCompetition(tx: Tx, where: ReturnType<typeof eq>) {
  const [row] = await tx.select().from(competitions).where(where).for('update')
  return row ?? null
}

/**
 * Lets a player in, under the row lock the caller holds: refuses leavers,
 * closed competitions and full ones, and gives a late joiner their matches.
 * False when they were already in.
 */
/** A game the fixture recheck added, for telling its players. */
export type NewGame = {
  homeId: string
  awayId: string
  round: number
  dueAt: Date
  late: boolean
}

/** Adds the player; returns their new games, or false if already a member. */
export async function admit(
  tx: Tx,
  competition: Competition,
  userId: string,
): Promise<NewGame[] | false> {
  const members = await tx
    .select({ userId: competitionMembers.userId })
    .from(competitionMembers)
    .where(eq(competitionMembers.competitionId, competition.id))
  if (members.some((m) => m.userId === userId)) return false

  // Leaving after the start settled their games, and an organiser who took
  // someone out meant it: either way, coming back is refused.
  const [left] = await tx
    .select({ userId: competitionLeavers.userId })
    .from(competitionLeavers)
    .where(
      and(
        eq(competitionLeavers.competitionId, competition.id),
        eq(competitionLeavers.userId, userId),
      ),
    )
    .limit(1)
  if (left) {
    throw new UserError(
      "They left after the start or were taken out, so they can't rejoin.",
    )
  }

  const decision = canJoin(competition)
  if (!decision.ok) throw new UserError(decision.reason)
  // results come from each player's chess.com games there
  if (competition.resultSource === 'chesscom') {
    await requireChessAccount(userId)
  }
  // checked under the row lock, so two joiners can't both take the last place
  if (competition.maxPlayers && members.length >= competition.maxPlayers) {
    throw new UserError("It's full.")
  }

  await tx
    .insert(competitionMembers)
    .values({ competitionId: competition.id, userId })

  return reconcileFixtures(tx, competition)
}

/**
 * Rechecks a running league's fixtures, under the row lock the caller holds:
 * every pair of current members must have their games. Anything missing (a
 * late joiner's games, or a pair that slipped through) goes into the shared
 * late round. Returns the games it added.
 */
export async function reconcileFixtures(
  tx: Tx,
  competition: Competition,
): Promise<NewGame[]> {
  if (competition.format !== 'league' || competition.status !== 'running') {
    return []
  }
  const members = await tx
    .select({ userId: competitionMembers.userId })
    .from(competitionMembers)
    .where(eq(competitionMembers.competitionId, competition.id))
    .orderBy(asc(competitionMembers.joinedAt), asc(competitionMembers.userId))
  const existing = await tx
    .select({
      id: matches.id,
      round: matches.round,
      homeUserId: matches.homeUserId,
      awayUserId: matches.awayUserId,
      byeUserId: matches.byeUserId,
      opensAt: matches.opensAt,
      dueAt: matches.dueAt,
      late: matches.late,
    })
    .from(matches)
    .where(eq(matches.competitionId, competition.id))
  const memberIds = members.map((m) => m.userId)
  const missing = missingFixtures(memberIds, existing, competition.legs)
  if (missing.length === 0) return []

  const now = new Date()
  // into the scheduled rounds still to come first, as a fresh draw would
  const plan = placeLateGames({
    missing,
    rounds: scheduledRounds(existing, new Set(memberIds)),
    now,
    matchdayDays: competition.matchdayDays,
  })
  for (const { matchId, fixture } of plan.fromByes) {
    await tx
      .update(matches)
      .set({
        homeUserId: fixture.homeId,
        awayUserId: fixture.awayId,
        byeUserId: null,
        leg: fixture.leg,
      })
      .where(eq(matches.id, matchId))
  }
  if (plan.inRounds.length > 0) {
    await tx.insert(matches).values(
      plan.inRounds.map((p) => ({
        competitionId: competition.id,
        round: p.round,
        leg: p.fixture.leg,
        homeUserId: p.fixture.homeId,
        awayUserId: p.fixture.awayId,
        opensAt: p.opensAt,
        dueAt: p.dueAt,
      })),
    )
  }
  const added: NewGame[] = [
    ...plan.fromByes.map(({ matchId, fixture }) => {
      const match = existing.find((m) => m.id === matchId)
      return {
        homeId: fixture.homeId,
        awayId: fixture.awayId,
        round: match?.round ?? 0,
        dueAt: match?.dueAt ?? now,
        late: false,
      }
    }),
    ...plan.inRounds.map((p) => ({
      homeId: p.fixture.homeId,
      awayId: p.fixture.awayId,
      round: p.round,
      dueAt: p.dueAt,
      late: false,
    })),
  ]
  if (plan.catchUp.length === 0) return added

  // what fits nowhere: the shared catch-up round
  const openLate = existing
    .filter((m) => m.late && m.dueAt > now)
    .sort((a, b) => b.round - a.round)[0]
  const window = lateRoundWindow({
    openLate: openLate ?? null,
    lastRound: Math.max(0, ...existing.map((m) => m.round)),
    lastDueAt: existing.length
      ? new Date(Math.max(...existing.map((m) => m.dueAt.getTime())))
      : null,
    matchdayDays: competition.matchdayDays,
    now,
  })
  // one round, one deadline: a later joiner's extra time is everyone's
  if (openLate && window.dueAt > openLate.dueAt) {
    await tx
      .update(matches)
      .set({ dueAt: window.dueAt, remindedAt: null })
      .where(
        and(
          eq(matches.competitionId, competition.id),
          eq(matches.round, window.round),
        ),
      )
  }
  await tx.insert(matches).values(
    plan.catchUp.map((m) => ({
      competitionId: competition.id,
      round: window.round,
      leg: m.leg,
      homeUserId: m.homeId,
      awayUserId: m.awayId,
      opensAt: now,
      dueAt: window.dueAt,
      late: true,
    })),
  )
  return [
    ...added,
    ...plan.catchUp.map((m) => ({
      homeId: m.homeId,
      awayId: m.awayId,
      round: window.round,
      dueAt: window.dueAt,
      late: true,
    })),
  ]
}

/** A league's scheduled (not catch-up) rounds, for placing late games. */
function scheduledRounds(
  rows: Array<{
    id: string
    round: number
    homeUserId: string | null
    awayUserId: string | null
    byeUserId: string | null
    opensAt: Date
    dueAt: Date
    late: boolean
  }>,
  memberIds: Set<string>,
): PlannedRound[] {
  const rounds = new Map<number, PlannedRound>()
  for (const row of rows) {
    if (row.late) continue
    const round = rounds.get(row.round) ?? {
      round: row.round,
      opensAt: row.opensAt,
      dueAt: row.dueAt,
      byes: [],
      busy: new Set<string>(),
    }
    // a bye of someone still in the league is a seat a late joiner can take
    if (row.byeUserId && memberIds.has(row.byeUserId)) {
      round.byes.push({ matchId: row.id, userId: row.byeUserId })
    }
    for (const id of [row.homeUserId, row.awayUserId]) {
      if (id) round.busy.add(id)
    }
    rounds.set(row.round, round)
  }
  return [...rounds.values()]
}

/**
 * Moves a league's unplayed catch-up games into the rounds still to come,
 * the way a late joiner's games are placed today (byes first, then rounds
 * where both players are free). For players who joined before that, and for
 * any seat that opens later. A moved game keeps its earlier start, so a game
 * already played but not yet read still counts; it takes the round's
 * deadline. Both players are told. Returns how many games moved.
 */
export async function tidyLateGames(competitionId: string) {
  const unplayedLate = and(
    eq(matches.competitionId, competitionId),
    eq(matches.late, true),
    isNull(matches.result),
    isNull(matches.winnerUserId),
    eq(matches.voided, false),
    isNull(matches.report),
    isNull(matches.gameUrl),
  )
  // cheap check without the lock: most leagues have nothing to move
  const [any] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(unplayedLate)
    .limit(1)
  if (!any) return 0

  const moves = await db.transaction(async (tx) => {
    const competition = await lockCompetition(
      tx,
      eq(competitions.id, competitionId),
    )
    if (competition?.format !== 'league' || competition.status !== 'running') {
      return []
    }
    const members = new Set(
      (
        await tx
          .select({ userId: competitionMembers.userId })
          .from(competitionMembers)
          .where(eq(competitionMembers.competitionId, competitionId))
      ).map((m) => m.userId),
    )
    const rows = await tx
      .select({
        id: matches.id,
        round: matches.round,
        leg: matches.leg,
        homeUserId: matches.homeUserId,
        awayUserId: matches.awayUserId,
        byeUserId: matches.byeUserId,
        opensAt: matches.opensAt,
        dueAt: matches.dueAt,
        late: matches.late,
      })
      .from(matches)
      .where(eq(matches.competitionId, competitionId))
    const movable = new Set(
      (
        await tx.select({ id: matches.id }).from(matches).where(unplayedLate)
      ).map((m) => m.id),
    )
    const candidates = rows.flatMap((row) =>
      movable.has(row.id) &&
      row.homeUserId &&
      row.awayUserId &&
      members.has(row.homeUserId) &&
      members.has(row.awayUserId)
        ? [
            {
              matchId: row.id,
              startedAt: row.opensAt,
              leg: (row.leg === 2 ? 2 : 1) as 1 | 2,
              homeId: row.homeUserId,
              awayId: row.awayUserId,
            },
          ]
        : [],
    )
    if (candidates.length === 0) return []
    const plan = placeLateGames({
      missing: candidates,
      rounds: scheduledRounds(rows, members),
      now: new Date(),
      matchdayDays: competition.matchdayDays,
    })
    const earlier = (a: Date, b: Date) => (a < b ? a : b)
    const moved: GameMove[] = []
    for (const { matchId, fixture } of plan.fromByes) {
      const bye = rows.find((r) => r.id === matchId)
      if (!bye) continue
      await tx
        .update(matches)
        .set({
          homeUserId: fixture.homeId,
          awayUserId: fixture.awayId,
          byeUserId: null,
          leg: fixture.leg,
          opensAt: earlier(bye.opensAt, fixture.startedAt),
          remindedAt: null,
        })
        .where(eq(matches.id, matchId))
      await tx.delete(matches).where(eq(matches.id, fixture.matchId))
      moved.push({ ...fixture, round: bye.round, dueAt: bye.dueAt })
    }
    for (const placed of plan.inRounds) {
      const { fixture } = placed
      await tx
        .update(matches)
        .set({
          round: placed.round,
          late: false,
          opensAt: earlier(placed.opensAt, fixture.startedAt),
          dueAt: placed.dueAt,
          remindedAt: null,
        })
        .where(eq(matches.id, fixture.matchId))
      moved.push({ ...fixture, round: placed.round, dueAt: placed.dueAt })
    }
    return moved
  })
  if (moves.length > 0) await notifyGamesMoved(competitionId, moves)
  return moves.length
}

/** The fixture recheck for every running league, each under its own lock. */
export async function reconcileAllFixtures() {
  const running = await db
    .select({ id: competitions.id })
    .from(competitions)
    .where(
      and(
        eq(competitions.status, 'running'),
        eq(competitions.format, 'league'),
      ),
    )
  let added = 0
  for (const { id } of running) {
    try {
      const games = await db.transaction(async (tx) => {
        const competition = await lockCompetition(tx, eq(competitions.id, id))
        return competition ? reconcileFixtures(tx, competition) : []
      })
      added += games.length
      await notifyNewGames(id, games)
      added += await tidyLateGames(id)
    } catch (error) {
      console.error('[fixtures] recheck failed', id, (error as Error).message)
    }
  }
  return added
}

/**
 * Joins with the invite code, or a public competition by its link. When the
 * organiser approves each player, this files a request instead.
 */
export async function joinCompetition(
  userId: string,
  where: { code: string } | { slug: string },
) {
  let outcome: { id: string; pending: boolean } | null = null
  let newGames: NewGame[] = []
  let challengeReady: { slug: string; ownerId: string } | null = null
  const slug = await db.transaction(async (tx) => {
    const competition = await lockCompetition(
      tx,
      'code' in where
        ? eq(competitions.inviteCode, where.code)
        : eq(competitions.slug, where.slug),
    )
    if (!competition) {
      throw new UserError(
        'code' in where ? 'No competition has that code.' : 'Not found.',
      )
    }
    // Without the code, only public competitions can be joined.
    if ('slug' in where && competition.visibility !== 'public') {
      throw new UserError('You need an invite code to join this one.')
    }
    if (competition.requireApproval) {
      const [already] = await tx
        .select({ userId: competitionMembers.userId })
        .from(competitionMembers)
        .where(
          and(
            eq(competitionMembers.competitionId, competition.id),
            eq(competitionMembers.userId, userId),
          ),
        )
        .limit(1)
      if (already) return competition.slug
      // fail early on what approval couldn't fix anyway
      const decision = canJoin(competition)
      if (!decision.ok) throw new UserError(decision.reason)
      const [filed] = await tx
        .insert(competitionRequests)
        .values({ competitionId: competition.id, userId })
        .onConflictDoNothing()
        .returning({ userId: competitionRequests.userId })
      if (filed) outcome = { id: competition.id, pending: true }
      return competition.slug
    }
    try {
      const admitted = await admit(tx, competition, userId)
      if (admitted) {
        newGames = admitted
        outcome = { id: competition.id, pending: false }
        // the opponent is in: the challenge starts by itself
        if (competition.format === 'challenge') {
          challengeReady = {
            slug: competition.slug,
            ownerId: competition.ownerId,
          }
        }
      }
    } catch (error) {
      // the leaver refusal is worded for organisers; say it to the player
      const message = (error as Error).message.replace(
        "They left after the start or were taken out, so they can't rejoin.",
        "You left after the start or were taken out, so you can't rejoin.",
      )
      throw new UserError(message)
    }
    return competition.slug
  })
  // after commit, so the organiser never hears about a join that rolled back
  const done = outcome as { id: string; pending: boolean } | null
  if (done) {
    await (done.pending
      ? notifyRequested(done.id, userId)
      : notifyJoined(done.id, userId))
    await notifyNewGames(done.id, newGames)
  }
  const ready = challengeReady as { slug: string; ownerId: string } | null
  if (ready) {
    await startCompetition(ready.slug, {
      id: ready.ownerId,
      isAdmin: false,
    }).catch((error) =>
      console.error('[challenge] auto-start failed', (error as Error).message),
    )
  }
  return { slug, pending: done?.pending ?? false }
}

/** Builds the schedule and moves the competition from open to running. */
export async function startCompetition(slug: string, viewer: Viewer) {
  const startedId = await db.transaction(async (tx) => {
    const competition = await lockCompetition(tx, eq(competitions.slug, slug))
    if (!competition) throw new UserError('Not found.')
    authorizeManage(viewer, competition)
    if (competition.status !== 'open')
      throw new UserError('It has already started.')

    // the organiser's seeding first; anyone unseeded follows in join order
    const members = await tx
      .select({ userId: competitionMembers.userId })
      .from(competitionMembers)
      .where(eq(competitionMembers.competitionId, competition.id))
      .orderBy(
        sql`${competitionMembers.seed} asc nulls last`,
        asc(competitionMembers.joinedAt),
        asc(competitionMembers.userId),
      )
    if (members.length < 2)
      throw new UserError('You need at least two players.')
    if (competition.format === 'challenge' && members.length !== 2) {
      throw new UserError('A challenge is between exactly two players.')
    }
    if (competition.format === 'groups') {
      const problem = groupsProblem(
        members.length,
        competition.groupCount,
        competition.advancing,
      )
      if (problem) throw new UserError(problem)
    }
    const ids = members.map((m) => m.userId)

    const now = Date.now()
    const days = competition.matchdayDays * DAY
    const rows =
      competition.format === 'league'
        ? generateDoubleRoundRobin(ids)
            .filter((f) => f.leg <= competition.legs)
            .map((f) => ({
              round: f.matchday,
              leg: f.leg,
              homeId: f.homeId,
              awayId: f.awayId,
              byeId: f.byeId,
            }))
        : competition.format === 'challenge'
          ? challengeGames(ids, competition.bestOf)
          : competition.format === 'groups'
            ? await drawIntoGroups(tx, competition, ids)
            : knockoutLegs(generateKnockoutRound1(ids), competition.legs)

    await tx.insert(matches).values(
      rows.map((m, index) => {
        const position = 'position' in m ? (m.position as number) : index
        // a challenge's games are all open at once; rounds otherwise follow each other
        const opensAt = new Date(
          now + (competition.format === 'challenge' ? 0 : (m.round - 1) * days),
        )
        return {
          competitionId: competition.id,
          round: m.round,
          position,
          leg: m.leg,
          homeUserId: m.homeId,
          awayUserId: m.awayId,
          byeUserId: m.byeId,
          groupNo: 'groupNo' in m ? (m.groupNo as number) : null,
          opensAt,
          dueAt: new Date(opensAt.getTime() + days),
        }
      }),
    )
    await tx
      .update(competitions)
      .set({ status: 'running', startedAt: new Date(now) })
      .where(eq(competitions.id, competition.id))
    return competition.id
  })
  await notifyStarted(startedId)
}

export type EditableSettings = Pick<
  CompetitionSettings,
  | 'visibility'
  | 'allowLateEntry'
  | 'unplayedRule'
  | 'points'
  | 'leaveRule'
  | 'maxPlayers'
  | 'earlyRounds'
  | 'timeControl'
  | 'tieBreaks'
  | 'startsAt'
>

export async function updateCompetitionSettings(
  slug: string,
  viewer: Viewer,
  settings: EditableSettings,
) {
  const [competition] = await db
    .select({
      id: competitions.id,
      ownerId: competitions.ownerId,
      visibility: competitions.visibility,
      format: competitions.format,
      unplayedRule: competitions.unplayedRule,
      points: competitions.points,
      status: competitions.status,
      timeControl: competitions.timeControl,
    })
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (!competition) throw new UserError('Not found.')
  authorizeManage(viewer, competition)
  // games already being read against one clock: changing it mid-way would be unfair
  if (
    settings.timeControl !== undefined &&
    settings.timeControl !== competition.timeControl &&
    competition.status !== 'open'
  ) {
    throw new UserError('The time control is fixed once it starts.')
  }
  if (settings.startsAt && competition.status !== 'open') {
    throw new UserError('It has already started.')
  }
  checkFormatRules({ ...settings, format: competition.format })
  const scoringChanged =
    settings.unplayedRule !== competition.unplayedRule ||
    JSON.stringify(settings.points) !== JSON.stringify(competition.points)
  // Changing the rules mid-way would rewrite results players already have.
  if (scoringChanged && (await hasResults(competition.id))) {
    throw new UserError("Scoring can't change once a result is in.")
  }
  // a challenge stays two players, invite only, straight in
  const shaped =
    competition.format === 'challenge'
      ? {
          ...settings,
          maxPlayers: 2,
          visibility: 'private' as const,
          requireApproval: false,
          startsAt: null,
        }
      : settings
  await db.update(competitions).set(shaped).where(eq(competitions.slug, slug))
}

async function hasResults(competitionId: string) {
  const [decided] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.competitionId, competitionId),
        or(
          sql`${matches.result} is not null`,
          sql`${matches.winnerUserId} is not null`,
        ),
      ),
    )
    .limit(1)
  return Boolean(decided)
}

/**
 * The organiser orders a knockout's players before the start (top seed
 * first; byes go to the top seeds), by hand or by chess.com rating.
 */
export async function seedCompetition(
  slug: string,
  viewer: Viewer,
  order: string[] | 'rating',
) {
  // the organiser check first: rating seeding asks chess.com about every player
  const [target] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (!target) throw new UserError('Not found.')
  authorizeManage(viewer, target)
  let wanted = order
  if (wanted === 'rating') {
    const rows = await db
      .select({
        userId: competitionMembers.userId,
        username: chessAccounts.username,
      })
      .from(competitionMembers)
      .innerJoin(
        competitions,
        eq(competitions.id, competitionMembers.competitionId),
      )
      .leftJoin(
        chessAccounts,
        eq(chessAccounts.userId, competitionMembers.userId),
      )
      .where(eq(competitions.slug, slug))
    const rated = await Promise.all(
      rows.map(async (r) => ({
        userId: r.userId,
        rating: r.username
          ? ((await fetchPlayerRating(r.username).catch(() => null))?.rating ??
            null)
          : null,
      })),
    )
    // unrated players go last, keeping their order
    wanted = rated
      .map((r, i) => ({ ...r, i }))
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.i - b.i)
      .map((r) => r.userId)
  }
  const ids = wanted
  await db.transaction(async (tx) => {
    const competition = await lockCompetition(tx, eq(competitions.slug, slug))
    if (!competition) throw new UserError('Not found.')
    authorizeManage(viewer, competition)
    if (
      !['knockout', 'groups'].includes(competition.format) ||
      competition.status !== 'open'
    ) {
      throw new UserError('Seeding is for a knockout that has not started.')
    }
    const members = await tx
      .select({ userId: competitionMembers.userId })
      .from(competitionMembers)
      .where(eq(competitionMembers.competitionId, competition.id))
    const memberIds = new Set(members.map((m) => m.userId))
    if (
      ids.length !== memberIds.size ||
      !ids.every((id) => memberIds.has(id))
    ) {
      throw new UserError('The players changed. Reload and try again.')
    }
    for (const [i, userId] of ids.entries()) {
      await tx
        .update(competitionMembers)
        .set({ seed: i + 1 })
        .where(
          and(
            eq(competitionMembers.competitionId, competition.id),
            eq(competitionMembers.userId, userId),
          ),
        )
    }
  })
}

/**
 * The daily cron: starts every open competition whose start day has come.
 * Too few players → the organiser is told and the date is cleared.
 */
export async function startScheduled(now = new Date()) {
  const due = await db
    .select({
      id: competitions.id,
      slug: competitions.slug,
      ownerId: competitions.ownerId,
    })
    .from(competitions)
    .where(
      and(eq(competitions.status, 'open'), lte(competitions.startsAt, now)),
    )
  let started = 0
  for (const c of due) {
    try {
      await startCompetition(c.slug, { id: c.ownerId, isAdmin: false })
      await notifyScheduledStart(c.id, null)
      started++
    } catch (error) {
      const reason = (error as Error).message
      console.error('[schedule] start failed', c.slug, reason)
      // still open: a second cron run or the organiser may have started it meanwhile
      const [cleared] = await db
        .update(competitions)
        .set({ startsAt: null })
        .where(and(eq(competitions.id, c.id), eq(competitions.status, 'open')))
        .returning({ id: competitions.id })
      if (cleared) await notifyScheduledStart(c.id, reason)
    }
  }
  return started
}

/**
 * A finished 1v1 challenge, again: a new challenge with the same settings,
 * owned by whoever asked, and the opponent is invited (it starts when they
 * join, as any challenge does). Returns the new slug.
 */
export async function rematch(slug: string, viewerId: string) {
  const [old] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (old?.format !== 'challenge') throw new UserError('Not found.')
  if (old.status !== 'finished') throw new UserError('Finish this one first.')
  const [first] = await db
    .select({ home: matches.homeUserId, away: matches.awayUserId })
    .from(matches)
    .where(eq(matches.competitionId, old.id))
    .orderBy(asc(matches.round))
    .limit(1)
  const players = [first?.home, first?.away]
  if (!players.includes(viewerId)) {
    throw new UserError('Only the two players can ask for a rematch.')
  }
  const opponentId = players.find((id) => id && id !== viewerId)
  if (!opponentId) throw new UserError('Your opponent has left Misri.')

  const base = old.name
    .replace(/ rematch( \d+)?$/i, '')
    .slice(0, 60 - ' rematch 10'.length)
  const names = [`${base} rematch`]
  for (let n = 2; n <= 10; n++) names.push(`${base} rematch ${n}`)
  const taken = await takenKeys(names.map(normalizeName))
  const name = names.find((candidate) => !taken.has(normalizeName(candidate)))
  if (!name)
    throw new UserError('Too many rematches under this name. Create one.')

  if (old.resultSource === 'chesscom') await requireChessAccount(viewerId)
  const newSlug = await createCompetition(viewerId, {
    name,
    resultSource: old.resultSource,
    format: 'challenge',
    legs: 1,
    bestOf: old.bestOf,
    matchdayDays: old.matchdayDays,
    visibility: 'private',
    allowLateEntry: false,
    unplayedRule: 'organiser',
    leaveRule: old.leaveRule,
    maxPlayers: 2,
    requireApproval: false,
    points: old.points,
    timeControl: old.timeControl,
  })
  const [created] = await db
    .select({ id: competitions.id, inviteCode: competitions.inviteCode })
    .from(competitions)
    .where(eq(competitions.slug, newSlug))
    .limit(1)
  await notifyRematch(created.id, viewerId, opponentId, created.inviteCode)
  return newSlug
}
