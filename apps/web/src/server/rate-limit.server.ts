import { sql } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { rateLimit } from '#/db/schema'

/**
 * Takes `adding` from a budget of `max` per `windowMs` under `key`; false when
 * that would go over. One statement, so requests at the same moment (on any
 * server instance) cannot both slip under the limit.
 */
export async function takeAllowance(
  key: string,
  adding: number,
  max: number,
  windowMs: number,
): Promise<boolean> {
  if (adding > max) return false
  const now = Date.now()
  const fresh = sql`${rateLimit.lastRequest} < ${now - windowMs}`
  const take = () =>
    db
      .insert(rateLimit)
      .values({ id: key, key, count: adding, lastRequest: now })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: {
          count: sql`case when ${fresh} then ${adding} else ${rateLimit.count} + ${adding} end`,
          lastRequest: sql`case when ${fresh} then ${now} else ${rateLimit.lastRequest} end`,
        },
        setWhere: sql`${fresh} or ${rateLimit.count} + ${adding} <= ${max}`,
      })
      .returning({ count: rateLimit.count })
  // Two first requests at once both insert; the loser trips the primary key
  // (same value as `key`) rather than the conflict target, so run it again.
  const [taken] = await take().catch(
    (error: { code?: string; cause?: { code?: string } }) => {
      if ((error.cause?.code ?? error.code) === '23505') return take()
      throw error
    },
  )
  return Boolean(taken)
}
