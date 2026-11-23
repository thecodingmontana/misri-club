import { createServerFn } from '@tanstack/react-start'
import { userMiddleware } from './auth.functions'
import { calendarToken, resetCalendarToken } from './calendar.server'

const pathOf = (token: string) => `/api/calendar/${token}.ics`

/** The path of your private calendar feed. */
export const getCalendarPathFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => ({
    path: pathOf(await calendarToken(context.user.id)),
  }))

/** A new private link; calendars subscribed to the old one stop updating. */
export const resetCalendarPathFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => ({
    path: pathOf(await resetCalendarToken(context.user.id)),
  }))
