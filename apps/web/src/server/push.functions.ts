import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db/client.server'
import { pushSubscriptions } from '#/db/schema'
import { userMiddleware } from './auth.functions'
import { pushPublicKey, sendPushes } from './push.server'
import { takeAllowance } from './rate-limit.server'

const HOUR = 60 * 60 * 1000

/** The VAPID public key browsers subscribe with; null when push isn't set up. */
export const getPushKeyFn = createServerFn({ method: 'GET' }).handler(() =>
  pushPublicKey(),
)

const subscription = z.object({
  endpoint: z.string().url().startsWith('https://').max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
})

/** Remembers this device for the signed-in player (re-saving is harmless). */
export const savePushFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(subscription)
  .handler(async ({ context, data }) => {
    if (!(await takeAllowance(`push-save:${context.user.id}`, 1, 30, HOUR))) {
      throw new Error('Too many tries. Wait an hour and try again.')
    }
    // an endpoint belongs to one browser; whoever signs in there now owns it
    await db
      .insert(pushSubscriptions)
      .values({ ...data, userId: context.user.id })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: context.user.id, p256dh: data.p256dh, auth: data.auth },
      })
    return { ok: true }
  })

export const removePushFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ endpoint: z.string().max(1000) }))
  .handler(async ({ context, data }) => {
    // only your own device: someone else's endpoint is left alone
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, data.endpoint),
          eq(pushSubscriptions.userId, context.user.id),
        ),
      )
    return { ok: true }
  })

/** A test notification to every device of the signed-in player. */
export const testPushFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => {
    if (!(await takeAllowance(`push-test:${context.user.id}`, 1, 5, HOUR))) {
      throw new Error('Too many tests. Wait an hour and try again.')
    }
    const sent = await sendPushes([
      {
        userId: context.user.id,
        title: 'Misri notifications are on',
        body: "You'll hear about your matches here.",
        url: '/account',
        tag: 'test',
      },
    ])
    return { sent }
  })
