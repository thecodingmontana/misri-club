import { APIError } from 'better-auth/api'
import { and, eq, inArray, ne, or } from 'drizzle-orm'
import { db } from '#/db/client.server'
import {
  type Competition,
  competitionLeavers,
  competitionMembers,
  competitionRequests,
  competitions,
  matches,
} from '#/db/schema'
import { generateInviteCode } from '#/db/utils'
import { authorize, roleOf, type Viewer } from '#/lib/access'
import { normalizeName } from '#/lib/competition-names'
import { settleLeaver } from '#/lib/leave'
import {
  admit,
  authorizeManage,
  isNameClash,
  lockCompetition,
  type NewGame,
  takenKeys,
} from './competitions.server'
import {
  notifyAnswered,
  notifyDeleted,
  notifyHandedOver,
  notifyLeft,
  notifyNewGames,
  notifyRemoved,
} from './notifications.server'
import { advance } from './results.server'

// Who is in a competition: leaving, being removed, handing over, deleting,
// plus the organiser's housekeeping (rename, a fresh invite code).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Before an account is deleted: deleting the owner deletes their competitions,
 * and everyone's games in them, so they hand those over first.
 */
export async function refuseIfOwner(userId: string) {
  const [owned] = await db
    .select({ name: competitions.name })
    .from(competitions)
    .innerJoin(
      competitionMembers,
      eq(competitionMembers.competitionId, competitions.id),
    )
    .where(
      and(
        eq(competitions.ownerId, userId),
        ne(competitionMembers.userId, userId),
      ),
    )
    .limit(1)
  if (owned) {
    throw new APIError('BAD_REQUEST', {
      message: `Hand over ${owned.name} to another player before deleting your account.`,
    })
  }
}

/**
 * Takes a member out. Before the start that's all; after it, the organiser's
 * leave rule settles their games and they're recorded so they can't rejoin.
 * Returns whether it had started.
 */
async function depart(tx: Tx, competition: Competition, userId: string) {
  // the table and champion are history now; leaving would rewrite them
  if (competition.status === 'finished') {
    throw new Error('This competition is over; its results are final.')
  }
  await tx
    .delete(competitionMembers)
    .where(
      and(
        eq(competitionMembers.competitionId, competition.id),
        eq(competitionMembers.userId, userId),
      ),
    )
  if (competition.status === 'open') return false

  const theirs = await tx
    .select({
      id: matches.id,
      homeUserId: matches.homeUserId,
      awayUserId: matches.awayUserId,
      result: matches.result,
      winnerUserId: matches.winnerUserId,
    })
    .from(matches)
    .where(
      and(
        eq(matches.competitionId, competition.id),
        or(eq(matches.homeUserId, userId), eq(matches.awayUserId, userId)),
      ),
    )
  const settlement = settleLeaver(
    theirs,
    userId,
    competition.leaveRule,
    competition.format,
  )
  for (const { matchId, winnerUserId } of settlement.award) {
    await tx
      .update(matches)
      .set({ winnerUserId })
      .where(eq(matches.id, matchId))
  }
  if (settlement.remove.length > 0) {
    await tx.delete(matches).where(inArray(matches.id, settlement.remove))
  }
  await tx
    .insert(competitionLeavers)
    .values({ competitionId: competition.id, userId })
    .onConflictDoNothing()
  return true
}

/**
 * The departure is already saved: moving the competition on and telling people
 * must not turn it into an error the player would retry.
 */
async function afterDeparture(
  startedId: string | null,
  notify: () => Promise<void>,
) {
  try {
    // the walkovers may finish a round or the whole competition
    if (startedId) await advance(startedId)
    await notify()
  } catch (error) {
    console.error('[membership] after leaving failed', (error as Error).message)
  }
}

async function isMember(tx: Tx, competitionId: string, userId: string) {
  const [row] = await tx
    .select({ userId: competitionMembers.userId })
    .from(competitionMembers)
    .where(
      and(
        eq(competitionMembers.competitionId, competitionId),
        eq(competitionMembers.userId, userId),
      ),
    )
    .limit(1)
  return Boolean(row)
}

/** A member leaves (the organiser hands over first). */
export async function leaveCompetition(slug: string, viewer: Viewer) {
  const left = await db.transaction(async (tx) => {
    const competition = await lockCompetition(tx, eq(competitions.slug, slug))
    if (!competition) throw new Error('Not found.')
    if (!(await isMember(tx, competition.id, viewer.id))) {
      throw new Error("You're not in this one.")
    }
    authorize('leave', {
      role: roleOf(viewer, competition, true),
      isAdmin: false,
      visibility: competition.visibility,
    })
    return (await depart(tx, competition, viewer.id)) ? competition.id : null
  })
  if (left) await afterDeparture(left, () => notifyLeft(left, viewer.id))
}

/** The organiser takes a player out, under the same rules as leaving. */
export async function removePlayer(
  slug: string,
  viewer: Viewer,
  userId: string,
) {
  const removed = await db.transaction(async (tx) => {
    const competition = await lockCompetition(tx, eq(competitions.slug, slug))
    if (!competition) throw new Error('Not found.')
    authorizeManage(viewer, competition)
    if (userId === competition.ownerId) {
      throw new Error('Hand it over before taking the organiser out.')
    }
    if (!(await isMember(tx, competition.id, userId))) {
      throw new Error("They're not in this one.")
    }
    const started = await depart(tx, competition, userId)
    // taken out before the start too: otherwise the link lets them straight back
    if (!started) {
      await tx
        .insert(competitionLeavers)
        .values({ competitionId: competition.id, userId })
        .onConflictDoNothing()
    }
    return { id: competition.id, started }
  })
  await afterDeparture(removed.started ? removed.id : null, () =>
    notifyRemoved(removed.id, userId),
  )
}

/** The organiser lets a requester in (with every normal join check) or not. */
export async function answerRequest(
  slug: string,
  viewer: Viewer,
  userId: string,
  approve: boolean,
) {
  let newGames: NewGame[] = []
  const competitionId = await db.transaction(async (tx) => {
    const competition = await lockCompetition(tx, eq(competitions.slug, slug))
    if (!competition) throw new Error('Not found.')
    authorizeManage(viewer, competition)
    const [request] = await tx
      .delete(competitionRequests)
      .where(
        and(
          eq(competitionRequests.competitionId, competition.id),
          eq(competitionRequests.userId, userId),
        ),
      )
      .returning({ userId: competitionRequests.userId })
    if (!request) throw new Error('That request is gone.')
    if (approve) newGames = (await admit(tx, competition, userId)) || []
    return competition.id
  })
  await notifyAnswered(competitionId, userId, approve)
  await notifyNewGames(competitionId, newGames)
}

/** A new name; the link (slug) stays, so shared links keep working. */
export async function renameCompetition(
  slug: string,
  viewer: Viewer,
  name: string,
) {
  const [competition] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (!competition) throw new Error('Not found.')
  authorizeManage(viewer, competition)
  const nameKey = normalizeName(name)
  if (nameKey === competition.nameKey) {
    // only the spacing or case changed
    await db
      .update(competitions)
      .set({ name })
      .where(eq(competitions.id, competition.id))
    return
  }
  if ((await takenKeys([nameKey])).size) throw new Error('That name is taken.')
  await db
    .update(competitions)
    .set({ name, nameKey })
    .where(eq(competitions.id, competition.id))
    .catch((error) => {
      throw isNameClash(error) ? new Error('That name is taken.') : error
    })
}

/** A fresh invite code; the old one stops working at once. */
export async function newInviteCode(slug: string, viewer: Viewer) {
  const [competition] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (!competition) throw new Error('Not found.')
  authorizeManage(viewer, competition)
  const inviteCode = generateInviteCode()
  await db
    .update(competitions)
    .set({ inviteCode })
    .where(eq(competitions.id, competition.id))
  return inviteCode
}

/** The organiser (or an admin) makes another member the organiser. */
export async function handOverCompetition(
  slug: string,
  viewer: Viewer,
  toUserId: string,
) {
  const competitionId = await db.transaction(async (tx) => {
    const competition = await lockCompetition(tx, eq(competitions.slug, slug))
    if (!competition) throw new Error('Not found.')
    authorizeManage(viewer, competition)
    if (toUserId === competition.ownerId) {
      throw new Error('They already run it.')
    }
    const [member] = await tx
      .select({ userId: competitionMembers.userId })
      .from(competitionMembers)
      .where(
        and(
          eq(competitionMembers.competitionId, competition.id),
          eq(competitionMembers.userId, toUserId),
        ),
      )
      .limit(1)
    if (!member) throw new Error('Pick someone who is in the competition.')
    await tx
      .update(competitions)
      .set({ ownerId: toUserId })
      .where(eq(competitions.id, competition.id))
    return competition.id
  })
  await notifyHandedOver(competitionId, toUserId)
}

/** Deletes it for everyone. The exact name must be typed, as a last check. */
export async function deleteCompetition(
  slug: string,
  viewer: Viewer,
  confirmName: string,
) {
  const [competition] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (!competition) throw new Error('Not found.')
  authorizeManage(viewer, competition)
  if (normalizeName(confirmName) !== competition.nameKey) {
    throw new Error('Type the name exactly to delete it.')
  }
  const members = await db
    .select({ userId: competitionMembers.userId })
    .from(competitionMembers)
    .where(eq(competitionMembers.competitionId, competition.id))
  // members, matches and leavers go with it (on delete cascade)
  await db.delete(competitions).where(eq(competitions.id, competition.id))
  await notifyDeleted(
    competition.name,
    members.map((m) => m.userId).filter((id) => id !== viewer.id),
  )
}
