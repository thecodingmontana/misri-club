/**
 * Search and share metadata. Every route's `head()` builds its tags here, so
 * titles, descriptions, canonical links, Open Graph and Twitter cards, and
 * JSON-LD all follow one pattern.
 */

export const SITE_NAME = 'Misri Chess Club'

/**
 * The public origin, e.g. `https://misri.vercel.app`. Canonical links and
 * share images need absolute URLs; without it they are left out rather than
 * guessed, and the sitemap falls back to the request's own origin.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? '').replace(/\/$/, '')

export const CLUB_URL = 'https://www.chess.com/club/misri'

export const HOME_DESCRIPTION =
  'Run chess leagues and knockout tournaments with your friends on chess.com, plus puzzles, master games and practice against Stockfish.'

interface Page {
  /** Short page name; the site name is appended. */
  title: string
  description: string
  /**
   * Path from the root, e.g. `/table`. Pages set it; the root's defaults
   * leave it out, since canonical links are not merged and would double up.
   */
  path?: string
  /** Keep the page out of search results (it still renders). */
  noindex?: boolean
  /** Schema.org data for rich results. */
  jsonLd?: object
}

export function seo({ title, description, path, noindex, jsonLd }: Page) {
  const fullTitle = title === SITE_NAME ? title : `${title} · ${SITE_NAME}`
  const url = SITE_URL && path !== undefined ? `${SITE_URL}${path}` : ''
  const image = `${SITE_URL}/og-image.png`

  return {
    meta: [
      { title: fullTitle },
      { name: 'description', content: description },
      ...(noindex ? [{ name: 'robots', content: 'noindex' }] : []),
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:title', content: fullTitle },
      { property: 'og:description', content: description },
      ...(url ? [{ property: 'og:url', content: url }] : []),
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content: `${SITE_NAME}: run a league, train every day`,
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: fullTitle },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
      // The router escapes this itself before writing the script tag.
      ...(jsonLd
        ? [
            {
              'script:ld+json': { '@context': 'https://schema.org', ...jsonLd },
            },
          ]
        : []),
    ],
    links: url ? [{ rel: 'canonical', href: url }] : [],
  }
}
