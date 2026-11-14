import { createServerFn } from '@tanstack/react-start'
import { and, eq, gt } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db/client.server'
import { chessAccounts, verification } from '#/db/schema'
import { generateNanoId } from '#/db/utils'
import {
  CODE_MINUTES,
  newVerificationCode,
  normalizeUsername,
  profileHasCode,
} from '#/lib/chess-verify'
import { userMiddleware } from './auth.functions'
import { fetchPlayerProfile } from './chesscom.server'
import { takeAllowance } from './rate-limit.server'

const HOUR = 60 * 60 * 1000
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
export const getChessAccountFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => {
    const [linked] = await db
      .select({
        username: chessAccounts.username,
        verifiedAt: chessAccounts.verifiedAt,
      })
      .from(chessAccounts)
      .where(eq(chessAccounts.userId, context.user.id))
      .limit(1)
    if (linked) {
      return {
        status: 'verified' as const,
        username: linked.username,
        verifiedAt: linked.verifiedAt.getTime(),
      }
    }
    const pending = await pendingCode(context.user.id)
    return pending
      ? { status: 'pending' as const, ...pending }
      : { status: 'none' as const }
  })

/** Step 1: name your chess.com account and get a code to put in your profile. */
export const startChessVerificationFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ username: z.string().max(40) }))
  .handler(async ({ context, data }) => {
    const username = normalizeUsername(data.username)
    if (!username) throw new Error('Enter your chess.com username.')

    if (!(await takeAllowance(`chess-start:${context.user.id}`, 1, 10, HOUR))) {
      throw new Error('Too many tries. Wait an hour and start again.')
    }

    const [owned] = await db
      .select({ userId: chessAccounts.userId })
      .from(chessAccounts)
      .where(eq(chessAccounts.username, username))
      .limit(1)
    if (owned) {
      throw new Error(
        owned.userId === context.user.id
          ? 'That account is already linked to you.'
          : 'That chess.com account is already linked to someone else.',
      )
    }

    if (!(await fetchPlayerProfile(username))) {
      throw new Error(`No chess.com account called "${username}".`)
    }

    const code = newVerificationCode()
    const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000)
    await db.transaction(async (tx) => {
      await tx
        .delete(verification)
        .where(eq(verification.identifier, pendingKey(context.user.id)))
      await tx.insert(verification).values({
        id: generateNanoId(),
        identifier: pendingKey(context.user.id),
        value: JSON.stringify({ username, code }),
        expiresAt,
      })
    })
    return { username, code, expiresAt: expiresAt.getTime() }
  })

/** Step 2: we read your public profile and, if the code is there, link it. */
export const checkChessVerificationFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => {
    if (!(await takeAllowance(`chess-check:${context.user.id}`, 1, 20, HOUR))) {
      throw new Error('Too many checks. Wait an hour and try again.')
    }

    const pending = await pendingCode(context.user.id)
    if (!pending) throw new Error('Your code expired. Start again.')

    const profile = await fetchPlayerProfile(pending.username)
    if (!profile || !profileHasCode(profile, pending.code)) {
      throw new Error(
        `${pending.code} isn't in your chess.com Location yet. Save it there, wait a minute, then check again.`,
      )
    }

    const linked = await db
      .insert(chessAccounts)
      .values({
        userId: context.user.id,
        username: pending.username,
        verifiedAt: new Date(),
        avatar: profile.avatar ?? '',
      })
      .onConflictDoNothing()
      .returning({ username: chessAccounts.username })
    await db
      .delete(verification)
      .where(eq(verification.identifier, pendingKey(context.user.id)))
    if (linked.length === 0) {
      throw new Error('That chess.com account was just linked to someone else.')
    }
    return { username: pending.username }
  })
