import assert from 'node:assert/strict'
import { test } from 'node:test'
import { savePush } from '@misri/core/account'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { pushSubscriptions, session, user } from '#/db/schema'

test('push: signing out (the session ends) drops that device', async () => {
  const tag = Math.random().toString(36).slice(2, 10)
  const userId = `p${tag}`
  const sessionId = `s${tag}`
  const endpoint = `https://fcm.googleapis.com/fcm/send/${tag}`
  await db.insert(user).values({ id: userId, name: 'Push', email: `${userId}@test.local` })
  await db.insert(session).values({
    id: sessionId,
    token: `t${tag}`,
    userId,
    expiresAt: new Date(Date.now() + 60_000),
  })
  try {
    await savePush(userId, { endpoint, p256dh: 'k', auth: 'a' }, sessionId)
    let rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
    assert.equal(rows[0]?.sessionId, sessionId)
    // Better Auth deletes the session row on sign-out and on "sign that device out"
    await db.delete(session).where(eq(session.id, sessionId))
    rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
    assert.equal(rows.length, 0, 'no more notifications to the signed-out browser')
  } finally {
    await db.delete(user).where(eq(user.id, userId))
  }
})
