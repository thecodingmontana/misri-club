import { customAlphabet } from 'nanoid'

const generateNanoIdCore = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  16,
)

/** A 16-character id (letters and digits), optionally `prefix_`-ed. Same as Zadaci's. */
export function generateNanoId(prefix?: string): string {
  const id = generateNanoIdCore()
  return prefix ? `${prefix}_${id}` : id
}

const generateInviteCodeCore = customAlphabet(
  // no 0/O, 1/I/L: codes get read aloud and typed from screenshots
  '23456789ABCDEFGHJKMNPQRSTUVWXYZ',
  8,
)

/** An 8-character invite code without look-alike characters. */
export function generateInviteCode(): string {
  return generateInviteCodeCore()
}
