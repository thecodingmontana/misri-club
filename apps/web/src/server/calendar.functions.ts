import { createServerFn } from '@tanstack/react-start'
import { userMiddleware } from './auth.functions'
import { calendarToken } from './calendar.server'

/** The path of your private calendar feed. */
export const getCalendarPathFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(({ context }) => ({
    path: `/api/calendar/${calendarToken(context.user.id)}.ics`,
  }))
