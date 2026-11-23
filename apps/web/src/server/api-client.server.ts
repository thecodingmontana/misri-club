import { type ApiClient, createApiClient } from '@misri/api-client'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getSessionCookie } from 'better-auth/cookies'

/**
 * The Misri API, called as the signed-in visitor (their session cookie is the
 * Bearer token). Null when MISRI_API_URL isn't set: local runs, tests and CI
 * read the database directly, and unsetting it on Vercel rolls back.
 */
export function apiClient(): ApiClient | null {
  const url = process.env.MISRI_API_URL
  if (!url) return null
  const headers = getRequestHeaders()
  return createApiClient({
    url,
    token: getSessionCookie(headers),
    // lets the API rate-limit each visitor, not this server as a whole
    headers: process.env.INTERNAL_API_SECRET
      ? {
          'x-misri-internal': process.env.INTERNAL_API_SECRET,
          'x-misri-client-ip':
            headers.get('x-real-ip') ??
            headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            'unknown',
        }
      : {},
  })
}
