import { faker } from '@faker-js/faker'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, count, eq, inArray, max, or, sql } from 'drizzle-orm'
import { db } from '#/db/client.server'
import {
  type Competition,
  chessAccounts,
  competitionMembers,
  competitions,
  matches,
  user,
} from '#/db/schema'
import { generateInviteCode, generateNanoId } from '#/db/utils'
import { generateKnockoutRound1 } from '#/lib/bracket'
import {
  normalizeName,
  suggestFrom,
  suggestNames,
} from '#/lib/competition-names'
import { canJoin, lateEntryMatches } from '#/lib/join-policy'
import { generateDoubleRoundRobin, matchdayCount } from '#/lib/round-robin'
import { auth } from './auth.server'
import { fetchPlayerProfile } from './chesscom.server'
import { type Tally, tallyStandings } from './standings'

const DAY = 24 * 60 * 60 * 1000

/** The signed-in viewer's id, or null; for pages anyone may read. */
export async function viewerId() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session?.user.id ?? null
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface CompetitionSettings {
  name: string
  format: Competition['format']
  legs: number
  matchdayDays: number
  visibility: Competition['visibility']
  allowLateEntry: boolean
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
}) {
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

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

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
async function takenKeys(keys: string[]) {
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

function isNameClash(error: unknown) {
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
async function lockCompetition(tx: Tx, where: ReturnType<typeof eq>) {
  const [row] = await tx.select().from(competitions).where(where).for('update')
  return row ?? null
}

/**
 * Joins `userId` to the competition found by `where`. Idempotent. A late
 * joiner in a running league gets a match against every member, in one extra
 * round. The row lock makes two late joiners at once still meet each other.
 */
export async function joinCompetition(
  userId: string,
  where: { code: string } | { slug: string },
) {
  return db.transaction(async (tx) => {
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

    const members = await tx
      .select({ userId: competitionMembers.userId })
      .from(competitionMembers)
      .where(eq(competitionMembers.competitionId, competition.id))
    if (members.some((m) => m.userId === userId)) return competition.slug

    const decision = canJoin(competition)
    if (!decision.ok) throw new Error(decision.reason)

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
    return competition.slug
  })
}

/** Builds the schedule and moves the competition from open to running. */
export async function startCompetition(slug: string, userId: string) {
  await db.transaction(async (tx) => {
    const competition = await lockCompetition(tx, eq(competitions.slug, slug))
    if (!competition) throw new Error('Not found.')
    if (competition.ownerId !== userId) {
      throw new Error('Only the organiser can start it.')
    }
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
      rows.map((m) => {
        const opensAt = new Date(now + (m.round - 1) * days)
        return {
          competitionId: competition.id,
          round: m.round,
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
  })
}

export async function updateCompetitionSettings(
  slug: string,
  userId: string,
  settings: Pick<CompetitionSettings, 'visibility' | 'allowLateEntry'>,
) {
  const [competition] = await db
    .select({ ownerId: competitions.ownerId, format: competitions.format })
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (!competition) throw new Error('Not found.')
  if (competition.ownerId !== userId) {
    throw new Error('Only the organiser can change this.')
  }
  checkFormatRules({ ...settings, format: competition.format })
  await db.update(competitions).set(settings).where(eq(competitions.slug, slug))
}

const memberCount = db
  .select({
    competitionId: competitionMembers.competitionId,
    members: count().as('members'),
  })
  .from(competitionMembers)
  .groupBy(competitionMembers.competitionId)
  .as('member_count')

const summaryColumns = {
  slug: competitions.slug,
  name: competitions.name,
  format: competitions.format,
  status: competitions.status,
  legs: competitions.legs,
  allowLateEntry: competitions.allowLateEntry,
  members: sql<number>`coalesce(${memberCount.members}, 0)`.mapWith(Number),
}

export type CompetitionSummary = Awaited<
  ReturnType<typeof listMyCompetitions>
>[number]

/** Competitions I own or joined, newest first. */
export async function listMyCompetitions(userId: string) {
  const mine = db
    .select({ id: competitionMembers.competitionId })
    .from(competitionMembers)
    .where(eq(competitionMembers.userId, userId))
  return db
    .select(summaryColumns)
    .from(competitions)
    .leftJoin(memberCount, eq(memberCount.competitionId, competitions.id))
    .where(or(eq(competitions.ownerId, userId), inArray(competitions.id, mine)))
    .orderBy(sql`${competitions.createdAt} desc`)
    .limit(100)
}

/** Public competitions anyone can still join, newest first. */
export async function listOpenCompetitions(viewerId: string | null) {
  const rows = await db
    .select(summaryColumns)
    .from(competitions)
    .leftJoin(memberCount, eq(memberCount.competitionId, competitions.id))
    .where(
      and(
        eq(competitions.visibility, 'public'),
        or(
          eq(competitions.status, 'open'),
          and(
            eq(competitions.status, 'running'),
            eq(competitions.format, 'league'),
            eq(competitions.allowLateEntry, true),
          ),
        ),
        viewerId
          ? sql`not exists (select 1 from ${competitionMembers} where ${competitionMembers.competitionId} = ${competitions.id} and ${competitionMembers.userId} = ${viewerId})`
          : undefined,
      ),
    )
    .orderBy(sql`${competitions.createdAt} desc`)
    .limit(30)
  return rows
}

/** What an invite link shows before you join. */
export async function getInvite(code: string) {
  const [competition] = await db
    .select({
      ...summaryColumns,
      visibility: competitions.visibility,
    })
    .from(competitions)
    .leftJoin(memberCount, eq(memberCount.competitionId, competitions.id))
    .where(eq(competitions.inviteCode, code))
    .limit(1)
  if (!competition) return null
  const decision = canJoin(competition)
  return {
    ...competition,
    canJoin: decision.ok,
    reason: decision.ok ? null : decision.reason,
  }
}

export interface PlayerView {
  id: string
  name: string
  image: string | null
  /** chess.com username; the name shown everywhere when present */
  chessUsername: string | null
}

export interface StandingRow extends Tally {
  player: PlayerView
}

export type MatchStatus =
  | 'bye'
  | 'played'
  | 'walkover'
  | 'upcoming'
  | 'live'
  | 'expired'

export interface MatchView {
  id: string
  round: number
  leg: number
  home: PlayerView | null
  away: PlayerView | null
  bye: PlayerView | null
  opensAt: number
  dueAt: number
  status: MatchStatus
  result: 'white' | 'black' | 'draw' | null
  homeWon: boolean | null
  gameUrl: string | null
  winnerId: string | null
}

function matchStatus(m: typeof matches.$inferSelect, now: number): MatchStatus {
  if (m.byeUserId) return 'bye'
  if (m.result) return 'played'
  if (m.winnerUserId) return 'walkover'
  if (m.opensAt.getTime() > now) return 'upcoming'
  if (m.dueAt.getTime() > now) return 'live'
  return 'expired'
}

/**
 * Everything the competition page shows. Public read; the invite code only
 * reaches the organiser.
 */
export async function getCompetition(slug: string, viewerId: string | null) {
  const [competition] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (!competition) return null

  const [memberRows, matchRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
        chessUsername: chessAccounts.username,
        chessAvatar: chessAccounts.avatar,
        joinedAt: competitionMembers.joinedAt,
      })
      .from(competitionMembers)
      .innerJoin(user, eq(user.id, competitionMembers.userId))
      .leftJoin(chessAccounts, eq(chessAccounts.userId, user.id))
      .where(eq(competitionMembers.competitionId, competition.id))
      .orderBy(asc(competitionMembers.joinedAt)),
    db
      .select()
      .from(matches)
      .where(eq(matches.competitionId, competition.id))
      .orderBy(asc(matches.round), asc(matches.leg), asc(matches.id)),
  ])

  // Accounts linked before avatars were stored: look each up once, then keep it.
  await Promise.all(
    memberRows
      .filter((m) => m.chessUsername && m.chessAvatar === null)
      .map(async (m) => {
        const profile = await fetchPlayerProfile(
          m.chessUsername as string,
        ).catch(() => null)
        if (!profile) return
        m.chessAvatar = profile.avatar ?? ''
        await db
          .update(chessAccounts)
          .set({ avatar: m.chessAvatar })
          .where(eq(chessAccounts.userId, m.id))
      }),
  )

  const now = Date.now()
  const players = new Map<string, PlayerView>(
    memberRows.map((m) => [
      m.id,
      {
        id: m.id,
        name: m.name,
        // chess.com picture first, then the sign-in picture, then a generated face
        image: m.chessAvatar || m.image,
        chessUsername: m.chessUsername,
      },
    ]),
  )
  const player = (id: string | null) => (id ? (players.get(id) ?? null) : null)

  const matchViews: Array<MatchView> = matchRows.map((m) => ({
    id: m.id,
    round: m.round,
    leg: m.leg,
    home: player(m.homeUserId),
    away: player(m.awayUserId),
    bye: player(m.byeUserId),
    opensAt: m.opensAt.getTime(),
    dueAt: m.dueAt.getTime(),
    status: matchStatus(m, now),
    result: m.result,
    homeWon:
      m.result && m.result !== 'draw'
        ? (m.result === 'white') === (m.whiteUserId === m.homeUserId)
        : null,
    gameUrl: m.gameUrl,
    winnerId: m.winnerUserId,
  }))

  // Rounds past the original schedule were added for late joiners.
  const startedWith = competition.startedAt
    ? memberRows.filter((m) => m.joinedAt <= (competition.startedAt as Date))
        .length
    : 0
  const scheduledRounds = (matchdayCount(startedWith) / 2) * competition.legs

  const standings: Array<StandingRow> | null =
    competition.format === 'league'
      ? [...tallyStandings(matchRows, [...players.keys()], new Date(now))]
          .map(([id, tally]) => ({
            player: player(id) as PlayerView,
            ...tally,
          }))
          .filter((row) => row.player)
          .sort(
            (a, b) =>
              b.points - a.points ||
              b.wins - a.wins ||
              a.forfeits - b.forfeits ||
              (a.player.chessUsername ?? a.player.name).localeCompare(
                b.player.chessUsername ?? b.player.name,
              ),
          )
      : null

  const isOwner = viewerId === competition.ownerId
  return {
    competition: {
      slug: competition.slug,
      name: competition.name,
      format: competition.format,
      legs: competition.legs,
      matchdayDays: competition.matchdayDays,
      status: competition.status,
      visibility: competition.visibility,
      allowLateEntry: competition.allowLateEntry,
      ownerId: competition.ownerId,
      startedAt: competition.startedAt?.getTime() ?? null,
      inviteCode: isOwner ? competition.inviteCode : null,
    },
    isOwner,
    isMember: viewerId !== null && players.has(viewerId),
    join: canJoin(competition),
    members: [...players.values()],
    matches: matchViews,
    scheduledRounds,
    standings,
  }
}
