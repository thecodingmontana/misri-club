import { and, asc, count, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '#/db/client.server'
import {
  chessAccounts,
  competitionLeavers,
  competitionMembers,
  competitionRequests,
  competitions,
  matches,
  user,
} from '#/db/schema'
import { can, roleOf, type Viewer } from '#/lib/access'
import { earlyRound } from '#/lib/early-rounds'
import { canJoin } from '#/lib/join-policy'
import { matchdayCount } from '#/lib/round-robin'
import { fetchPlayerProfile } from './chesscom.server'
import { syncResults } from './results.server'
import { type Tally, tallyStandings } from './standings'

// What people see: their competitions, the open ones, an invite preview and
// the competition page itself.

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
/**
 * What an invite shows before you join: the competition, its rules, who runs
 * it, and where the viewer already stands (in it, asked, or left for good).
 */
export async function getInvite(code: string, viewerId: string | null) {
  const [competition] = await db
    .select({
      ...summaryColumns,
      id: competitions.id,
      visibility: competitions.visibility,
      matchdayDays: competitions.matchdayDays,
      unplayedRule: competitions.unplayedRule,
      points: competitions.points,
      requireApproval: competitions.requireApproval,
      maxPlayers: competitions.maxPlayers,
      organiser: sql<string>`coalesce(${chessAccounts.username}, ${user.name})`,
    })
    .from(competitions)
    .leftJoin(memberCount, eq(memberCount.competitionId, competitions.id))
    .innerJoin(user, eq(user.id, competitions.ownerId))
    .leftJoin(chessAccounts, eq(chessAccounts.userId, competitions.ownerId))
    .where(eq(competitions.inviteCode, code))
    .limit(1)
  if (!competition) return null
  const { id, ...shown } = competition
  const where = (
    table:
      | typeof competitionMembers
      | typeof competitionRequests
      | typeof competitionLeavers,
  ) =>
    viewerId
      ? db
          .select({ userId: table.userId })
          .from(table)
          .where(and(eq(table.competitionId, id), eq(table.userId, viewerId)))
          .limit(1)
      : Promise.resolve([])
  const [member, request, left] = await Promise.all([
    where(competitionMembers),
    where(competitionRequests),
    where(competitionLeavers),
  ])
  const decision = canJoin(competition)
  const full = Boolean(
    competition.maxPlayers && competition.members >= competition.maxPlayers,
  )
  return {
    ...shown,
    isMember: member.length > 0,
    requested: request.length > 0,
    canJoin: decision.ok && !full && left.length === 0,
    reason: !decision.ok
      ? decision.reason
      : left.length > 0
        ? "You left this one after it started, so you can't rejoin."
        : full
          ? "It's full."
          : null,
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
  | 'void'

export interface MatchView {
  id: string
  round: number
  position: number
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
  /** the organiser's word on a decision */
  note: string | null
}

function matchStatus(m: typeof matches.$inferSelect, now: number): MatchStatus {
  if (m.byeUserId) return 'bye'
  if (m.voided) return 'void'
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
export async function getCompetition(slug: string, viewer: Viewer | null) {
  const viewerId = viewer?.id ?? null
  // fresh results from chess.com first (throttled inside); never fail the page over it
  const [peek] = await db
    .select({ id: competitions.id, status: competitions.status })
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (peek?.status === 'running') {
    await syncResults(peek.id).catch((error) =>
      console.error('[results] sync failed', (error as Error).message),
    )
  }
  const [competition] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (!competition) return null

  const [memberRows, matchRows, requestRows] = await Promise.all([
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
      // seeded players in seed order, then everyone by when they joined
      .orderBy(
        sql`${competitionMembers.seed} asc nulls last`,
        asc(competitionMembers.joinedAt),
      ),
    db
      .select()
      .from(matches)
      .where(eq(matches.competitionId, competition.id))
      .orderBy(
        asc(matches.round),
        asc(matches.position),
        asc(matches.leg),
        asc(matches.id),
      ),
    db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
        chessUsername: chessAccounts.username,
        chessAvatar: chessAccounts.avatar,
      })
      .from(competitionRequests)
      .innerJoin(user, eq(user.id, competitionRequests.userId))
      .leftJoin(chessAccounts, eq(chessAccounts.userId, user.id))
      .where(eq(competitionRequests.competitionId, competition.id))
      .orderBy(asc(competitionRequests.createdAt)),
  ])

  // Accounts linked before avatars were stored: look each up once, then keep it.
  await Promise.all(
    memberRows
      .filter((m) => m.chessUsername && m.chessAvatar === null)
      .map(async (m) => {
        const profile = await fetchPlayerProfile(
          m.chessUsername as string,
        ).catch(() => undefined)
        // a failed call tries again next time; a missing player is stored as no avatar
        if (profile === undefined) return
        m.chessAvatar = profile?.avatar ?? ''
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
    position: m.position,
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
    note: m.note,
  }))

  // Matches waiting on the organiser: expired under "I decide" (any expired
  // tie in a knockout), or a drawn knockout tie that still needs a winner.
  const awaiting = matchRows
    .filter((m) => {
      if (!m.homeUserId || !m.awayUserId || m.voided || m.winnerUserId) {
        return false
      }
      if (competition.format === 'knockout' && m.result === 'draw') return true
      if (m.result) return false
      return (
        m.dueAt.getTime() <= now &&
        (competition.format === 'knockout' ||
          competition.unplayedRule === 'organiser')
      )
    })
    .map((m) => m.id)

  // Rounds past the original schedule were added for late joiners.
  const startedWith = competition.startedAt
    ? memberRows.filter((m) => m.joinedAt <= (competition.startedAt as Date))
        .length
    : 0
  const scheduledRounds = (matchdayCount(startedWith) / 2) * competition.legs

  const standings: Array<StandingRow> | null =
    competition.format === 'league'
      ? [
          ...tallyStandings(matchRows, [...players.keys()], new Date(now), {
            unplayed: competition.unplayedRule,
            points: competition.points,
          }),
        ]
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

  const isMember = viewerId !== null && players.has(viewerId)
  const access = {
    role: roleOf(viewer, competition, isMember),
    isAdmin: viewer?.isAdmin ?? false,
    visibility: competition.visibility,
  }
  // Invite-only details stay with the people in it (and admins).
  const details = can('viewDetails', access)
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
      unplayedRule: competition.unplayedRule,
      points: competition.points,
      leaveRule: competition.leaveRule,
      earlyRounds: competition.earlyRounds,
      maxPlayers: competition.maxPlayers,
      requireApproval: competition.requireApproval,
      finishedAt: competition.finishedAt?.getTime() ?? null,
      // user ids stay with the people who can see the players
      championId: details ? competition.championUserId : null,
      ownerId: details ? competition.ownerId : '',
      startedAt: competition.startedAt?.getTime() ?? null,
      inviteCode: can('seeInviteCode', access) ? competition.inviteCode : null,
    },
    isOrganiser: access.role === 'organiser',
    isMember,
    canManage: can('manage', access),
    canSeeDetails: details,
    awaitingDecision: can('manage', access) ? awaiting : [],
    // a league round the organiser could open now (everyone has played)
    earlyRound:
      can('manage', access) &&
      competition.format === 'league' &&
      competition.status === 'running' &&
      competition.earlyRounds !== 'wait'
        ? earlyRound(
            matchRows,
            new Set(players.keys()),
            competition.unplayedRule,
            new Date(now),
          )
        : null,
    // who asked to join: the organiser sees them all, a player only their own
    requests: can('manage', access)
      ? requestRows.map(
          (r): PlayerView => ({
            id: r.id,
            name: r.name,
            image: r.chessAvatar || r.image,
            chessUsername: r.chessUsername,
          }),
        )
      : ([] as PlayerView[]),
    requested: requestRows.some((r) => r.id === viewerId),
    playerCount: players.size,
    join: canJoin(competition),
    members: details ? [...players.values()] : ([] as PlayerView[]),
    matches: details ? matchViews : [],
    scheduledRounds,
    standings: details ? standings : null,
  }
}
