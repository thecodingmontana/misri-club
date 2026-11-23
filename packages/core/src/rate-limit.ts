import { db } from '@misri/db/client'
import { allowance } from '@misri/db/schema'
import { sql } from 'drizzle-orm'

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
  const fresh = sql`${allowance.lastRequest} < ${now - windowMs}`
  const [taken] = await db
    .insert(allowance)
    .values({ key, count: adding, lastRequest: now })
    .onConflictDoUpdate({
      target: allowance.key,
      set: {
        count: sql`case when ${fresh} then ${adding} else ${allowance.count} + ${adding} end`,
        lastRequest: sql`case when ${fresh} then ${now} else ${allowance.lastRequest} end`,
      },
      setWhere: sql`${fresh} or ${allowance.count} + ${adding} <= ${max}`,
    })
    .returning({ count: allowance.count })
  return Boolean(taken)
}

/** Budgets whose longest window (a day) is over: nothing reads them again. */
export async function pruneAllowances(now = Date.now()) {
  await db
    .delete(allowance)
    .where(sql`${allowance.lastRequest} < ${now - 24 * 60 * 60_000}`)
}
