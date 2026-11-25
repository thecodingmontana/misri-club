import {
  EMPTY,
  type Progress,
  progressSchema,
  withDrill,
  withGuess,
  withPuzzle,
} from '@misri/core/progress'

export * from '@misri/core/progress'

/** Kept in this browser only. */
const KEY = 'misri:progress:v1'

export function readProgress(): Progress {
  try {
    const stored = progressSchema.safeParse(
      JSON.parse(localStorage.getItem(KEY) ?? 'null'),
    )
    return stored.success ? stored.data : EMPTY
  } catch {
    return EMPTY
  }
}

function save(update: (progress: Progress) => Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(update(readProgress())))
  } catch {
    // Storage blocked or full: training still works, it just isn't counted.
  }
}

export const recordPuzzle = (themes: Array<string>, clean: boolean) =>
  save((p) => withPuzzle(p, themes, clean))
export const recordDrill = (slug: string, clean: boolean) =>
  save((p) => withDrill(p, slug, clean))
export const recordGuess = (slug: string, found: number, tried: number) =>
  save((p) => withGuess(p, slug, found, tried))

