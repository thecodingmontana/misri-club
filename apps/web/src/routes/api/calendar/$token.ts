import { createFileRoute } from '@tanstack/react-router'
import { SITE_URL } from '#/lib/seo'
import { calendarFeed, userOfToken } from '#/server/calendar.server'

/** A player's match deadlines as a calendar feed; the token is their key. */
export const Route = createFileRoute('/api/calendar/$token')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const userId = userOfToken(params.token)
        const feed = userId
          ? await calendarFeed(userId, SITE_URL || new URL(request.url).origin)
          : null
        if (!feed) return new Response('Not found', { status: 404 })
        return new Response(feed, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="misri.ics"',
            // calendar apps poll; a few minutes old is fine and keeps it cheap
            'Cache-Control': 'private, max-age=600',
          },
        })
      },
    },
  },
})
