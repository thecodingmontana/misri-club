import { getCompetition as readCompetition } from '@misri/core/competition-view'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { chessAccounts, competitionMembers, competitions } from '#/db/schema'
import type { Viewer } from '#/lib/access'
import { apiClient } from './api-client.server'
import { fetchPlayerProfile } from './chesscom.server'
import { syncResults } from './results.server'

// The reads live in packages/core so the API shares them; the page adds the
// chess.com work before reading.
export * from '@misri/core/competition-view'

const SYNC_WAIT_MS = 3000
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Everything the competition page shows, after fresh results from chess.com
 * (throttled inside; never fails the page) and any missing avatars.
 */
export async function getCompetition(slug: string, viewer: Viewer | null) {
  const [peek] = await db
    .select({ id: competitions.id, status: competitions.status })
    .from(competitions)
    .where(eq(competitions.slug, slug))
    .limit(1)
  if (peek?.status === 'running') {
    const sync = syncResults(peek.id).catch((error) =>
      console.error('[results] sync failed', (error as Error).message),
    )
    // a slow chess.com mustn't hold the page: show what we have after a moment
    await Promise.race([sync, wait(SYNC_WAIT_MS)])
  }
  // same for pictures: a slow chess.com shows initials this time, not a stall
  if (peek) {
    await Promise.race([
      fillAvatars(peek.id).catch((error) =>
        console.error('[avatars] fill failed', (error as Error).message),
      ),
      wait(SYNC_WAIT_MS),
    ])
  }
  return apiClient()?.competition(slug) ?? readCompetition(slug, viewer)
}

/** Accounts linked before avatars were stored: look each up once, then keep it. */
async function fillAvatars(competitionId: string) {
  const missing = await db
    .select({ userId: chessAccounts.userId, username: chessAccounts.username })
    .from(competitionMembers)
    .innerJoin(
      chessAccounts,
      eq(chessAccounts.userId, competitionMembers.userId),
    )
    .where(
      and(
        eq(competitionMembers.competitionId, competitionId),
        isNotNull(chessAccounts.username),
        isNull(chessAccounts.avatar),
      ),
    )
  await Promise.all(
    missing.map(async (m) => {
      const profile = await fetchPlayerProfile(m.username).catch(
        () => undefined,
      )
      // a failed call tries again next time; a missing player is stored as no avatar
      if (profile === undefined) return
      await db
        .update(chessAccounts)
        .set({ avatar: profile?.avatar ?? '' })
        .where(eq(chessAccounts.userId, m.userId))
    }),
  )
}
