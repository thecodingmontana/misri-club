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
