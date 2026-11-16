// English only: the root import ships every locale in the server bundle
import { faker } from '@faker-js/faker/locale/en'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq, inArray, max, or, sql } from 'drizzle-orm'
import { db } from '#/db/client.server'
import {
  type Competition,
  chessAccounts,
  competitionLeavers,
  competitionMembers,
  competitionRequests,
  competitions,
  matches,
} from '#/db/schema'
import { generateInviteCode, generateNanoId } from '#/db/utils'
import { authorize, roleOf, type Viewer } from '#/lib/access'
import { generateKnockoutRound1 } from '#/lib/bracket'
import {
  normalizeName,
  suggestFrom,
  suggestNames,
} from '#/lib/competition-names'
import { canJoin, lateEntryMatches } from '#/lib/join-policy'
import type { LeaveRule } from '#/lib/leave'
import { generateDoubleRoundRobin } from '#/lib/round-robin'
import { auth, isAdminEmail } from './auth.server'
import {
  notifyJoined,
  notifyRequested,
  notifyStarted,
} from './notifications.server'
import type { Points, UnplayedRule } from './standings'

const DAY = 24 * 60 * 60 * 1000

/** The signed-in viewer's id, or null; for pages anyone may read. */
export async function viewerId() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session?.user.id ?? null
}

/** The signed-in viewer with their site role, or null. */
export async function currentViewer(): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session
    ? { id: session.user.id, isAdmin: isAdminEmail(session.user) }
    : null
}

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
}

/** Create and join need a verified chess.com account: results come from there. */
export async function requireChessAccount(userId: string) {
  const [linked] = await db
    .select({ username: chessAccounts.username })
    .from(chessAccounts)
    .where(eq(chessAccounts.userId, userId))
    .limit(1)
  if (!linked) throw new Error('Link your chess.com account first.')
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
    throw new Error('In a tournament the organiser decides unplayed matches.')
  }
  if (settings.format === 'knockout' && settings.allowLateEntry) {
    throw new Error("A tournament can't take late entries.")
  }
  if (settings.format === 'knockout' && (settings.legs ?? 1) !== 1) {
    throw new Error('A tournament has one game per pairing.')
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
  settings: CompetitionSettings,
) {
  checkFormatRules(settings)
  const nameKey = normalizeName(settings.name)
  if ((await takenKeys([nameKey])).size) throw new Error(NAME_TAKEN)
  const slug = await uniqueSlug(settings.name)
  // Two creates with one name at once: the unique key turns away the second.
  await createRows(ownerId, settings, nameKey, slug).catch((error) => {
    throw isNameClash(error) ? new Error(NAME_TAKEN) : error
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
 * Joins `userId` to the competition found by `where`. Idempotent. A late
 * joiner in a running league gets a match against every member, in one extra
 * round. The row lock makes two late joiners at once still meet each other.
 */
/**
 * Lets a player in, under the row lock the caller holds: refuses leavers,
 * closed competitions and full ones, and gives a late joiner their matches.
 * False when they were already in.
 */
export async function admit(tx: Tx, competition: Competition, userId: string) {
  const members = await tx
    .select({ userId: competitionMembers.userId })
    .from(competitionMembers)
    .where(eq(competitionMembers.competitionId, competition.id))
  if (members.some((m) => m.userId === userId)) return false

  // Leaving after the start settled their games; coming back would reopen them.
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
    throw new Error(
      "They left this one after it started, so they can't rejoin.",
    )
  }

  const decision = canJoin(competition)
  if (!decision.ok) throw new Error(decision.reason)
  // checked under the row lock, so two joiners can't both take the last place
  if (competition.maxPlayers && members.length >= competition.maxPlayers) {
    throw new Error("It's full.")
  }

  await tx
    .insert(competitionMembers)
    .values({ competitionId: competition.id, userId })

  if (competition.status === 'running') {
    const [latest] = await tx
      .select({ round: max(matches.round), dueAt: max(matches.dueAt) })
      .from(matches)
      .where(eq(matches.competitionId, competition.id))
    const late = lateEntryMatches({
      userId,
      memberIds: members.map((m) => m.userId),
      legs: competition.legs,
      round: (latest?.round ?? 0) + 1,
      matchdayDays: competition.matchdayDays,
      latestDueAt: latest?.dueAt ?? null,
      now: new Date(),
    })
    if (late.length > 0) {
      await tx.insert(matches).values(
        late.map((m) => ({
          competitionId: competition.id,
          round: m.round,
          leg: m.leg,
          homeUserId: m.homeId,
          awayUserId: m.awayId,
          opensAt: m.opensAt,
          dueAt: m.dueAt,
        })),
      )
    }
  }
  return true
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
  const slug = await db.transaction(async (tx) => {
    const competition = await lockCompetition(
      tx,
      'code' in where
        ? eq(competitions.inviteCode, where.code)
        : eq(competitions.slug, where.slug),
    )
    if (!competition) {
      throw new Error(
        'code' in where ? 'No competition has that code.' : 'Not found.',
      )
    }
    // Without the code, only public competitions can be joined.
    if ('slug' in where && competition.visibility !== 'public') {
      throw new Error('You need an invite code to join this one.')
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
      if (!decision.ok) throw new Error(decision.reason)
      const [filed] = await tx
        .insert(competitionRequests)
        .values({ competitionId: competition.id, userId })
        .onConflictDoNothing()
        .returning({ userId: competitionRequests.userId })
      if (filed) outcome = { id: competition.id, pending: true }
      return competition.slug
    }
    try {
      if (await admit(tx, competition, userId)) {
        outcome = { id: competition.id, pending: false }
      }
    } catch (error) {
      // the leaver refusal is worded for organisers; say it to the player
      const message = (error as Error).message.replace(
        "They left this one after it started, so they can't rejoin.",
        "You left this one after it started, so you can't rejoin.",
      )
      throw new Error(message)
    }
    return competition.slug
  })
  // after commit, so the organiser never hears about a join that rolled back
  const done = outcome as { id: string; pending: boolean } | null
  if (done) {
    await (done.pending
      ? notifyRequested(done.id, userId)
      : notifyJoined(done.id, userId))
  }
  return { slug, pending: done?.pending ?? false }
}

/** Builds the schedule and moves the competition from open to running. */
export async function startCompetition(slug: string, viewer: Viewer) {
  const startedId = await db.transaction(async (tx) => {
    const competition = await lockCompetition(tx, eq(competitions.slug, slug))
    if (!competition) throw new Error('Not found.')
    authorizeManage(viewer, competition)
    if (competition.status !== 'open')
      throw new Error('It has already started.')

    // Join order is the seeding: shortcut until organisers can seed by hand.
    const members = await tx
      .select({ userId: competitionMembers.userId })
      .from(competitionMembers)
      .where(eq(competitionMembers.competitionId, competition.id))
      .orderBy(asc(competitionMembers.joinedAt), asc(competitionMembers.userId))
    if (members.length < 2) throw new Error('You need at least two players.')
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
        : generateKnockoutRound1(ids).map((m) => ({ ...m, leg: 1 }))

    await tx.insert(matches).values(
      rows.map((m, position) => {
        const opensAt = new Date(now + (m.round - 1) * days)
        return {
          competitionId: competition.id,
          round: m.round,
          position,
          leg: m.leg,
          homeUserId: m.homeId,
          awayUserId: m.awayId,
          byeUserId: m.byeId,
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
    })
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (!competition) throw new Error('Not found.')
  authorizeManage(viewer, competition)
  checkFormatRules({ ...settings, format: competition.format })
  const scoringChanged =
    settings.unplayedRule !== competition.unplayedRule ||
    JSON.stringify(settings.points) !== JSON.stringify(competition.points)
  // Changing the rules mid-way would rewrite results players already have.
  if (scoringChanged && (await hasResults(competition.id))) {
    throw new Error("Scoring can't change once a result is in.")
  }
  await db.update(competitions).set(settings).where(eq(competitions.slug, slug))
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
