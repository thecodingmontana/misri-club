// Hermes has no Intl.RelativeTimeFormat, so the website's wording by hand.
const UNITS: Array<[string, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

/** "3 days ago" / "in 2 hours" / "yesterday"; "just now" under a minute. */
export function relativeTime(input: number | string | Date | null): string {
  if (input == null) return 'never'
  const diff = new Date(input).getTime() - Date.now()
  if (Number.isNaN(diff)) return 'never'
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) < ms) continue
    const n = Math.round(Math.abs(diff) / ms)
    if (unit === 'day' && n === 1) return diff < 0 ? 'yesterday' : 'tomorrow'
    const words = `${n} ${unit}${n === 1 ? '' : 's'}`
    return diff < 0 ? `${words} ago` : `in ${words}`
  }
  return 'just now'
}

// the club's zone, as on the website
const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Nairobi',
})

export const formatDate = (input: number | string | Date) =>
  dateFormatter.format(new Date(input))
