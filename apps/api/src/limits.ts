import { timingSafeEqual } from 'node:crypto'
import { clientIp, takeAllowance } from '@misri/core/rate-limit'
import type { MiddlewareHandler } from 'hono'

/** Requests per client per minute; a page in the web app makes one or two. */
export const REQUESTS_PER_MINUTE = 120
/** Bytes in a request body; real queries here are a few hundred. */
export const MAX_BODY_BYTES = 16 * 1024

/**
 * One visitor's budget key. An IPv6 user usually holds a whole /64 and could
 * rotate through it, so that block counts as one visitor.
 */
export function visitorKey(ip: string) {
  if (!ip.includes(':') || ip.includes('.')) return ip
  const [head, tail = ''] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = ip.includes('::') && tail ? tail.split(':') : []
  const groups = ip.includes('::')
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : left
  return `${groups
    .slice(0, 4)
    .map((g) => (Number.parseInt(g, 16) || 0).toString(16))
    .join(':')}::/64`
}

/**
 * The web app calls the API from its server, so every visitor would arrive
 * from Vercel's IPs and share one budget. With the shared secret it passes
 * the visitor's own IP, which is then counted instead.
 */
export function trustedCaller(headers: Headers) {
  const secret = process.env.INTERNAL_API_SECRET
  const given = headers.get('x-misri-internal')
  if (!secret || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** 429 once a client goes over its minute; counted in the database, so every instance agrees. */
export const rateLimit: MiddlewareHandler = async (c, next) => {
  const headers = c.req.raw.headers
  const ip = trustedCaller(headers)
    ? (headers.get('x-misri-client-ip') ?? 'unknown')
    : clientIp(headers)
  const key = `api:${visitorKey(ip)}`
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
