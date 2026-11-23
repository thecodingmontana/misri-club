import { db } from '@misri/db/client'
import {
  chessAccounts,
  type EngineScore,
  gameAnalyses,
  matches,
  notifications,
  pushSubscriptions,
  user as userTable,
  verification,
} from '@misri/db/schema'
import { generateNanoId } from '@misri/db/utils'
import { and, count, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import {
  CODE_MINUTES,
  newVerificationCode,
  normalizeUsername,
  profileHasCode,
} from './chess-verify.ts'
import {
  fetchArchive,
  fetchArchiveUrls,
  fetchMonthGames,
  fetchPlayerProfile,
} from './chesscom.ts'
import {
  checkCompetitionName,
  suggestCompetitionNames,
} from './competitions.ts'
import { UserError } from './errors.ts'
import {
  type ArchiveGame,
  GAME_COUNTS,
  latestGames,
  toMyGame,
} from './my-games.ts'
import { sendPushes } from './push.ts'
import { takeAllowance } from './rate-limit.ts'

/**
 * One player's own things: their chess.com link, inbox, push devices,
 * onboarding and latest games. Shared by the web app and the API.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

async function allow(
  key: string,
  max: number,
  windowMs: number,
  message: string,
) {
  if (!(await takeAllowance(key, 1, max, windowMs)))
    throw new UserError(message)
}

// --- chess.com account ---------------------------------------------------

const pendingKey = (userId: string) => `chess-verify:${userId}`

async function pendingCode(userId: string) {
  const [row] = await db
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, pendingKey(userId)),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .limit(1)
  if (!row) return null
  const { username, code } = JSON.parse(row.value) as {
    username: string
    code: string
  }
  return { username, code, expiresAt: row.expiresAt.getTime() }
}

/** Your linked chess.com account, or the code you are verifying, or nothing. */
export async function chessAccount(userId: string) {
  const [linked] = await db
    .select({
      username: chessAccounts.username,
      verifiedAt: chessAccounts.verifiedAt,
    })
    .from(chessAccounts)
    .where(eq(chessAccounts.userId, userId))
    .limit(1)
  if (linked) {
    return {
      status: 'verified' as const,
      username: linked.username,
      verifiedAt: linked.verifiedAt.getTime(),
    }
  }
  const pending = await pendingCode(userId)
  return pending
    ? { status: 'pending' as const, ...pending }
    : { status: 'none' as const }
}

/** Step 1: name your chess.com account and get a code to put in your profile. */
export async function startChessVerification(userId: string, raw: string) {
  const username = normalizeUsername(raw)
  if (!username) throw new UserError('Enter your chess.com username.')
  await allow(
    `chess-start:${userId}`,
    10,
    HOUR,
    'Too many tries. Wait an hour and start again.',
  )

  const [owned] = await db
    .select({ userId: chessAccounts.userId })
    .from(chessAccounts)
    .where(eq(chessAccounts.username, username))
    .limit(1)
  if (owned) {
    throw new UserError(
      owned.userId === userId
        ? 'That account is already linked to you.'
        : 'That chess.com account is already linked to someone else.',
    )
  }
  if (!(await fetchPlayerProfile(username))) {
    throw new UserError(`No chess.com account called "${username}".`)
  }

  const code = newVerificationCode()
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000)
  await db.transaction(async (tx) => {
    await tx
      .delete(verification)
      .where(eq(verification.identifier, pendingKey(userId)))
    await tx.insert(verification).values({
      id: generateNanoId(),
      identifier: pendingKey(userId),
      value: JSON.stringify({ username, code }),
      expiresAt,
    })
  })
  return { username, code, expiresAt: expiresAt.getTime() }
}

/** Step 2: we read your public profile and, if the code is there, link it. */
export async function checkChessVerification(userId: string) {
  await allow(
    `chess-check:${userId}`,
    20,
    HOUR,
    'Too many checks. Wait an hour and try again.',
  )
  const pending = await pendingCode(userId)
  if (!pending) throw new UserError('Your code expired. Start again.')

  const profile = await fetchPlayerProfile(pending.username)
  if (!profile || !profileHasCode(profile, pending.code)) {
    throw new UserError(
      `${pending.code} isn't in your chess.com Location yet. Save it there, wait a minute, then check again.`,
    )
  }
  const linked = await db
    .insert(chessAccounts)
    .values({
      userId,
      username: pending.username,
      verifiedAt: new Date(),
      avatar: profile.avatar ?? '',
    })
    .onConflictDoNothing()
    .returning({ username: chessAccounts.username })
  await db
    .delete(verification)
    .where(eq(verification.identifier, pendingKey(userId)))
  if (linked.length === 0) {
    throw new UserError(
      'That chess.com account was just linked to someone else.',
    )
  }
  return { username: pending.username }
}

/** Onboarding without chess.com: they can link it later from their account. */
export async function skipOnboarding(userId: string) {
  await db
    .update(userTable)
    .set({ onboardedAt: new Date() })
    .where(eq(userTable.id, userId))
  return { ok: true }
}

// --- inbox ---------------------------------------------------------------

const INBOX_SIZE = 50

/** The player's latest notifications, newest first. */
export function inbox(userId: string) {
  return db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      url: notifications.url,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(INBOX_SIZE)
}

/** How many are unread, for the bell. */
export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ unread: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  return row?.unread ?? 0
}

/** Opening the inbox reads everything in it. */
export async function markInboxRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  return { ok: true }
}

// --- push devices --------------------------------------------------------

/** Remembers this device for the player (re-saving is harmless). */
export async function savePush(
  userId: string,
  device: { endpoint: string; p256dh: string; auth: string },
  sessionId?: string,
) {
  await allow(
    `push-save:${userId}`,
    30,
    HOUR,
    'Too many tries. Wait an hour and try again.',
  )
  // an endpoint belongs to one browser; whoever signs in there now owns it
  await db
    .insert(pushSubscriptions)
    .values({ ...device, userId, sessionId })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, sessionId, p256dh: device.p256dh, auth: device.auth },
    })
  return { ok: true }
}

export async function removePush(userId: string, endpoint: string) {
  // only your own device: someone else's endpoint is left alone
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, userId),
      ),
    )
  return { ok: true }
}

/** A test notification to every device of the player. */
export async function testPush(userId: string) {
  await allow(
    `push-test:${userId}`,
    5,
    HOUR,
    'Too many tests. Wait an hour and try again.',
  )
  const sent = await sendPushes([
    {
      userId,
      title: 'Misri notifications are on',
      body: "You'll hear about your matches here.",
      url: '/account',
      tag: 'test',
    },
  ])
  return { sent }
}

// --- competition names ---------------------------------------------------

async function allowNameLookup(userId: string) {
  await allow(
    `competition-name:${userId}`,
    60,
    MINUTE,
    'Too many tries. Wait a minute and try again.',
  )
}

/** Is this name free? When not, three free ones close to it. */
export async function competitionNameCheck(userId: string, name: string) {
  await allowNameLookup(userId)
  return checkCompetitionName(name)
}

/** Three free chess-themed names. */
export async function competitionNameIdeas(userId: string) {
  await allowNameLookup(userId)
  return suggestCompetitionNames()
}

// --- my games ------------------------------------------------------------

// shortcut: stops after a year of archives, so a player who rarely plays may get fewer games; raise if anyone asks
const MAX_MONTHS = 12
const COUNT = Math.max(...GAME_COUNTS)

/** Your chess.com username, after the per-player allowance for chess.com reads. */
async function linkedAccount(userId: string) {
  const [account] = await db
    .select({ username: chessAccounts.username })
    .from(chessAccounts)
    .where(eq(chessAccounts.userId, userId))
    .limit(1)
  if (!account) throw new UserError('Link your chess.com account first.')
  await allow(
    `my-games:${userId}`,
    30,
    HOUR,
    'Too many refreshes. Try again in a while.',
  )
  return account
}

/** Your latest chess.com games (up to the biggest pick), newest first. */
export async function myGames(userId: string) {
  const account = await linkedAccount(userId)
  const months = (await fetchArchiveUrls(account.username))
    .slice(-MAX_MONTHS)
    .reverse()
  const games: Array<ArchiveGame> = []
  for (const month of months) {
    games.push(...(await fetchArchive(month)))
    if (latestGames(games, account.username, COUNT).length >= COUNT) break
  }
  return {
    username: account.username,
    games: latestGames(games, account.username, COUNT),
  }
}

/**
 * One competition game you played, by its chess.com link, however old: the
 * lesson page's fallback when it isn't among your latest games.
 */
export async function matchGame(userId: string, url: string) {
  // only games of matches you played: the month comes from the match
  const [match] = await db
    .select({ endedAt: matches.endedAt })
    .from(matches)
    .where(
      and(
        eq(matches.gameUrl, url),
        or(eq(matches.homeUserId, userId), eq(matches.awayUserId, userId)),
      ),
    )
    .limit(1)
  if (!match?.endedAt) return null
  const account = await linkedAccount(userId)
  const month = match.endedAt.toISOString().slice(0, 7).replace('-', '/')
  const game = (await fetchMonthGames(account.username, month)).find(
    (g) => g.url === url,
  )
  return game ? toMyGame(game, account.username) : null
}

// --- saved engine analysis -----------------------------------------------

/** Most games a page asks about at once (the analysis page shows up to 50). */
export const MAX_ANALYSES = 50

/** Your saved engine scores for these games, by game link; missing ones are left out. */
export async function savedAnalyses(userId: string, urls: string[]) {
  if (urls.length === 0) return {}
  const rows = await db
    .select({ gameUrl: gameAnalyses.gameUrl, scores: gameAnalyses.scores })
    .from(gameAnalyses)
    .where(
      and(
        eq(gameAnalyses.userId, userId),
        inArray(gameAnalyses.gameUrl, urls.slice(0, MAX_ANALYSES)),
      ),
    )
  return Object.fromEntries(rows.map((r) => [r.gameUrl, r.scores]))
}

/** Keeps one game's engine scores with the account (a finished game never changes). */
export async function saveAnalysis(
  userId: string,
  gameUrl: string,
  scores: EngineScore[],
) {
  // one save per analysed game; a page analyses at most 50
  await allow(
    `analysis-save:${userId}`,
    300,
    HOUR,
    'Too many saves. Try again in a while.',
  )
  await db
    .insert(gameAnalyses)
    .values({ userId, gameUrl, scores })
    .onConflictDoUpdate({
      target: [gameAnalyses.userId, gameAnalyses.gameUrl],
      set: { scores },
    })
  return { ok: true }
}
