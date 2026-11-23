import { inbox, unreadCount } from '@misri/core/account'
import { createServerFn } from '@tanstack/react-start'
import { apiClient, perform } from './api-client.server'
import { userMiddleware } from './auth.functions'

/** The signed-in player's latest notifications, newest first. */
export const getInboxFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(({ context }) => apiClient()?.inbox() ?? inbox(context.user.id))

/** How many are unread, for the bell. */
export const getUnreadCountFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(
    ({ context }) => apiClient()?.unreadCount() ?? unreadCount(context.user.id),
  )

/** Opening the inbox reads everything in it. */
export const markInboxReadFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(({ context }) => perform('markInboxRead', context.viewer, {}))
