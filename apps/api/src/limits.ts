import { takeAllowance } from '@misri/core/rate-limit'
import type { MiddlewareHandler } from 'hono'

/** Requests per client per minute; a page in the web app makes one or two. */
export const REQUESTS_PER_MINUTE = 120
/** Bytes in a request body; real queries here are a few hundred. */
export const MAX_BODY_BYTES = 16 * 1024

/** Vercel sets these itself (a client can't forge them); locally they're absent. */
export const clientIp = (headers: Headers) =>
  headers.get('x-real-ip') ??
  headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown'

/** 429 once a client goes over its minute; counted in the database, so every instance agrees. */
export const rateLimit: MiddlewareHandler = async (c, next) => {
  const key = `api:${clientIp(c.req.raw.headers)}`
  const allowed = await takeAllowance(
    key,
    1,
    REQUESTS_PER_MINUTE,
    60_000,
  ).catch((error: Error) => {
    // the limiter guards the database; if it's down, the query fails anyway
    console.error('[rate-limit] check failed', error.message)
    return true
  })
  if (!allowed) {
    return c.json({ error: 'Too many requests. Try again in a minute.' }, 429, {
      'Retry-After': '60',
    })
  }
  await next()
}
