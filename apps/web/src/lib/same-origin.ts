/**
 * A browser request sent by another site (CSRF): the session cookie would ride
 * along, so anything that changes data refuses it. Same-origin requests,
 * typed-in navigations and non-browser callers (no Origin, no Sec-Fetch-Site:
 * tests, webhooks, the mobile app) pass. Same check as Zadaci's.
 */
export function crossSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return true
  const origin = request.headers.get('origin')
  return Boolean(origin) && origin !== new URL(request.url).origin
}

/** Methods that only read, so a cross-site request can't change anything. */
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
