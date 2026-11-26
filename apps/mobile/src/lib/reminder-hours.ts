/** How often the puzzle reminder comes: once a day, or every few hours. */
export type Every = 1 | 3 | 24

// the repeating reminders keep to waking hours
const FIRST = 8
const LAST = 21

/** The hours of the day the puzzle reminder fires, given the choice. */
export function puzzleHours(puzzleAt: number | null, every: Every): number[] {
  if (puzzleAt === null) return []
  if (every === 24) return [puzzleAt]
  const hours: number[] = []
  for (let h = FIRST; h <= LAST; h += every) hours.push(h)
  return hours
}
