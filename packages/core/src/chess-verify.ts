import { customAlphabet } from 'nanoid'

/**
 * Proving you own a chess.com account: we show a code, you put it in your
 * chess.com profile's Location (or Name), and we read it back through the
 * public API. Pure helpers here; the server function does the I/O.
 */

/** No 0/O or 1/I, so the code survives being typed by hand. */
const makeCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6)

export const CODE_MINUTES = 30

export function newVerificationCode(): string {
  return `MISRI-${makeCode()}`
}

/** chess.com usernames: 3–25 letters, digits, `_` or `-`; stored lowercase. */
export function normalizeUsername(raw: string): string | null {
  const username = raw.trim().replace(/^@/, '').toLowerCase()
  return /^[a-z0-9_-]{3,25}$/.test(username) ? username : null
}

/** Whether the public profile carries the code, in any case or spacing. */
export function profileHasCode(
  profile: { location?: string | null; name?: string | null },
  code: string,
): boolean {
  const squash = (text: string) => text.replace(/\s+/g, '').toUpperCase()
  const wanted = squash(code)
  return [profile.location, profile.name].some(
    (field) => typeof field === 'string' && squash(field).includes(wanted),
  )
}
