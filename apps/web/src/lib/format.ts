const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

/** "3 days ago" / "in 2 hours". Falls back to "just now" under a minute. */
export function relativeTime(input: number | string | Date | null): string {
  if (input == null) return 'never'
  const time = new Date(input).getTime()
  if (Number.isNaN(time)) return 'never'

  const diff = time - Date.now()

  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return 'just now'
}

/**
 * Compact time-remaining label for a deadline: "2d 4h", "3h 12m", "8m", "now".
 * Deliberately coarse — a fixture window is measured in days, so seconds would
 * be noise.
 */
export function countdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'closed'

  const minutes = Math.floor(msRemaining / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return 'now'
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatDate(input: number | string | Date): string {
  return dateFormatter.format(new Date(input))
}

/** `w-d-l` in a fixed shape so columns line up in monospace. */
export function record(wins: number, draws: number, losses: number): string {
  return `${wins}–${draws}–${losses}`
}
