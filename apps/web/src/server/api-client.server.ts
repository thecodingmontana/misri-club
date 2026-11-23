import { type ApiClient, createApiClient } from '@misri/api-client'
import type { Viewer } from '@misri/core/access'
import {
  type ActionInput,
  type ActionName,
  type ActionResult,
  runAction,
} from '@misri/core/actions'
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

/**
 * One write: through the API as the signed-in visitor when it's configured,
 * here otherwise. Either way the same shared action runs (packages/core).
 */
export function perform<N extends ActionName>(
  name: N,
  viewer: Viewer,
  input: ActionInput<N>,
): Promise<ActionResult<N>> {
  const client = apiClient()
  return client ? client.act(name, input) : runAction(name, viewer, input)
}
