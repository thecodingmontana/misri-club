import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The admin session cookie: `<expiresAtMs>.<hmac>`. It carries no secret, only
 * "an admin until then", so a signature is enough and nothing is encrypted.
 */
export function sealSession(key: string, expiresAt: number): string {
  return `${expiresAt}.${sign(key, String(expiresAt))}`
}

/** True when `value` was sealed with `key` and has not expired. */
export function openSession(
  key: string,
  value: string | undefined,
  now = Date.now(),
): boolean {
  const [expiresAt, mac] = (value ?? '').split('.')
  if (!expiresAt || !mac) return false

  const expected = Buffer.from(sign(key, expiresAt))
  const actual = Buffer.from(mac)
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected) &&
    Number(expiresAt) > now
  )
}

function sign(key: string, payload: string) {
  return createHmac('sha256', key).update(payload).digest('base64url')
}
