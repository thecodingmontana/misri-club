import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { db } from '#/db/client.server'
import { notifications } from '#/db/schema'
import { userMiddleware } from './auth.functions'

const INBOX_SIZE = 50

/** The signed-in player's latest notifications, newest first. */
export const getInboxFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(async ({ context }) =>
    db
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        url: notifications.url,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, context.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(INBOX_SIZE),
  )

/** How many are unread, for the bell. */
export const getUnreadCountFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => {
    const [row] = await db
      .select({ unread: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, context.user.id),
          isNull(notifications.readAt),
        ),
      )
    return row?.unread ?? 0
  })

/** Opening the inbox reads everything in it. */
export const markInboxReadFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, context.user.id),
          isNull(notifications.readAt),
        ),
      )
    return { ok: true }
  })
