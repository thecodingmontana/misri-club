import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pruneAllowances, takeAllowance } from '@misri/core/rate-limit'
import { eq, sql } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { allowance, rateLimit } from '#/db/schema'

const HOUR = 60 * 60_000

test('a used-up budget stays used up when Better Auth prunes its own table', async () => {
  const key = `test:${Math.random().toString(36).slice(2)}`
  for (let i = 0; i < 5; i++) assert.equal(await takeAllowance(key, 1, 5, HOUR), true)
  assert.equal(await takeAllowance(key, 1, 5, HOUR), false)
  // what Better Auth does on every bucket rollover: drop rows older than a minute
  await db.execute(sql`delete from ${rateLimit} where ${rateLimit.lastRequest} < ${Date.now() + 1}`)
  assert.equal(await takeAllowance(key, 1, 5, HOUR), false, 'still refused for the rest of the hour')
  await db.delete(allowance).where(eq(allowance.key, key))
})

test('pruning drops only budgets older than a day', async () => {
  const [old, recent] = [`test:old:${Date.now()}`, `test:new:${Date.now()}`]
  await db.insert(allowance).values([
    { key: old, count: 1, lastRequest: Date.now() - 25 * HOUR },
    { key: recent, count: 1, lastRequest: Date.now() - HOUR },
  ])
  await pruneAllowances()
  const left = await db.select({ key: allowance.key }).from(allowance)
  assert.ok(!left.some((r) => r.key === old))
  assert.ok(left.some((r) => r.key === recent))
  await db.delete(allowance).where(eq(allowance.key, recent))
})
