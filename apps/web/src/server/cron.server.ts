import { timingSafeEqual } from 'node:crypto'

/**
 * The scheduled jobs (Vercel Cron, the hourly GitHub Actions run) send
 * `Authorization: Bearer $CRON_SECRET`; nothing else may run them.
 */
export function authorised(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const wanted = Buffer.from(`Bearer ${secret}`)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}
