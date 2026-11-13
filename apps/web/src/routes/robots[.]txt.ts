import { createFileRoute } from '@tanstack/react-router'
import { SITE_URL } from '#/lib/seo'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = SITE_URL || new URL(request.url).origin
        // Server functions are RPC endpoints, not pages.
        const body = `User-agent: *\nAllow: /\nDisallow: /_serverFn/\n\nSitemap: ${origin}/sitemap.xml\n`
        return new Response(body, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      },
    },
  },
})
