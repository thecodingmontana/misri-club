import { z } from 'zod'

/**
 * What a player has practised. Each trainer records its results and the
 * progress screen charts them; the website keeps it in the browser, the app on
 * the phone. The game against Stockfish keeps its own record (see play.ts).
 */

const tally = z.object({ done: z.number(), clean: z.number() })

export const progressSchema = z.object({
  /** Every finished puzzle, once, whatever its themes. */
  solved: tally.default({ done: 0, clean: 0 }),
  /** Puzzles by Lichess theme; `clean` = solved without a mistake or help. */
  puzzles: z.record(z.string(), tally),
  /** Opening drills by course slug; `clean` = played through without a slip. */
  openings: z.record(z.string(), tally),
  /** Best guess-the-move score per master game, as found / tried. */
  masters: z.record(
    z.string(),
    z.object({ found: z.number(), tried: z.number() }),
  ),
  /** Days with any training, as YYYY-MM-DD, for the streak. */
  days: z.array(z.string()),
})

export type Progress = z.infer<typeof progressSchema>

export const EMPTY: Progress = {
  solved: { done: 0, clean: 0 },
  puzzles: {},
  openings: {},
  masters: {},
  days: [],
}

const today = () => new Date().toLocaleDateString('en-CA')

function bump(
  record: Record<string, { done: number; clean: number }>,
  key: string,
  clean: boolean,
) {
  const current = record[key] ?? { done: 0, clean: 0 }
  return {
    ...record,
    [key]: { done: current.done + 1, clean: current.clean + (clean ? 1 : 0) },
  }
}

function markDay(days: Array<string>, day: string) {
  return days.includes(day) ? days : [...days, day].slice(-366)
}

/** A finished puzzle counts once for each of its themes. */
export function withPuzzle(
  progress: Progress,
  themes: Array<string>,
  clean: boolean,
  day = today(),
): Progress {
  let puzzles = progress.puzzles
  for (const theme of themes) puzzles = bump(puzzles, theme, clean)
  const solved = {
    done: progress.solved.done + 1,
    clean: progress.solved.clean + (clean ? 1 : 0),
  }
  return { ...progress, solved, puzzles, days: markDay(progress.days, day) }
}

export function withDrill(
  progress: Progress,
  slug: string,
  clean: boolean,
  day = today(),
): Progress {
  return {
    ...progress,
    openings: bump(progress.openings, slug, clean),
    days: markDay(progress.days, day),
  }
}

/** Keeps the best guess-the-move result for a game: most moves found. */
export function withGuess(
  progress: Progress,
  slug: string,
  found: number,
  tried: number,
  day = today(),
): Progress {
  const best = progress.masters[slug]
  const better = !best || found / tried > best.found / best.tried
  return {
    ...progress,
    masters: better
      ? { ...progress.masters, [slug]: { found, tried } }
      : progress.masters,
    days: markDay(progress.days, day),
  }
}

/** Consecutive days of training ending today or yesterday. */
export function streak(days: Array<string>, day = today()): number {
  const set = new Set(days)
  const cursor = new Date(`${day}T12:00:00`)
  if (!set.has(day)) cursor.setDate(cursor.getDate() - 1)
  let count = 0
  while (set.has(cursor.toLocaleDateString('en-CA'))) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

/**
 * The themes to practise next: lowest clean-solve rate first, among themes
 * tried at least `min` times so one unlucky puzzle does not count.
 */
export function weakestThemes(
  puzzles: Progress['puzzles'],
  min = 3,
  count = 3,
): Array<{ theme: string; rate: number }> {
  return Object.entries(puzzles)
    .filter(([, tally]) => tally.done >= min)
    .map(([theme, tally]) => ({ theme, rate: tally.clean / tally.done }))
    .sort((a, b) => a.rate - b.rate || a.theme.localeCompare(b.theme))
    .slice(0, count)
}
