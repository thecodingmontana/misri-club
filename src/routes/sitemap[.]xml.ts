import { createFileRoute } from '@tanstack/react-router'
import { MASTER_GAMES } from '#/lib/masters'
import { OPENINGS } from '#/lib/openings'
import { SITE_URL } from '#/lib/seo'

/** Every indexable page; player pages come from the live roster. */
const PAGES = [
  '/',
  '/table',
  '/fixtures',
  '/club',
  '/all-time',
  '/train',
  '/train/puzzles',
  '/train/play',
  '/train/masters',
  '/train/openings',
  ...OPENINGS.map((course) => `/train/openings/${course.slug}`),
  ...MASTER_GAMES.map((game) => `/train/masters/${game.slug}`),
]

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Imported here so the database client stays out of the browser bundle.
        const { listAllPlayers } = await import('#/server/league.server')
        const origin = SITE_URL || new URL(request.url).origin
        const players = (await listAllPlayers()).map(
          (player) => `/players/${encodeURIComponent(player.username)}`,
        )

        const urls = [...PAGES, ...players]
          .map((path) => `  <url><loc>${origin}${path}</loc></url>`)
          .join('\n')
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

        return new Response(body, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
