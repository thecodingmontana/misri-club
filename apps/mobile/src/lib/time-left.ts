/** "1.4 MB/s": a download's speed, from bytes per second. */
export function speedLabel(bytesPerSecond: number) {
  const mb = bytesPerSecond / 1024 / 1024
  return mb >= 1
    ? `${mb.toFixed(1)} MB/s`
    : `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`
}

/**
 * About how long the rest takes at this speed, in words; null until there's a
 * speed worth estimating from.
 */
export function timeLeft(remaining: number, bytesPerSecond: number) {
  if (bytesPerSecond <= 0) return null
  const seconds = remaining / bytesPerSecond
  if (seconds < 5) return 'Almost done'
  if (seconds < 60) return `About ${Math.ceil(seconds / 5) * 5} s left`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `About ${minutes} min left`
  return `About ${Math.floor(minutes / 60)} h ${minutes % 60} min left`
}
