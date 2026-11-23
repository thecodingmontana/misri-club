/**
 * A display name as tables and fixtures show it: control and bidi-override
 * characters dropped, spaces collapsed, 1-50 characters, otherwise null.
 */
export function cleanName(raw: string | null | undefined): string | null {
  const name = (raw ?? '')
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  return name.length >= 1 && name.length <= 50 ? name : null
}
