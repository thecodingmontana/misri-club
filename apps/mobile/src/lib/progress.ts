import {
  EMPTY,
  type Progress,
  progressSchema,
  withDrill,
  withGuess,
  withPuzzle,
} from '@misri/core/progress'
import { scheduleReminders } from '@/lib/reminders'
import * as Store from '@/lib/storage'
import { refreshWidgets } from '@/widgets/register'

export * from '@misri/core/progress'

/** Kept on this phone only, as the website keeps it in the browser. */
const KEY = 'misri.progress.v1'

export async function readProgress(): Promise<Progress> {
  try {
    const stored = progressSchema.safeParse(
      JSON.parse((await Store.getItemAsync(KEY)) ?? 'null'),
    )
    return stored.success ? stored.data : EMPTY
  } catch {
    return EMPTY
  }
}

// one write at a time, so two quick results can't overwrite each other
let queue: Promise<unknown> = Promise.resolve()
function save(update: (progress: Progress) => Progress) {
  queue = queue
    .then(async () =>
      Store.setItemAsync(KEY, JSON.stringify(update(await readProgress()))),
    )
    // trained today: tonight's streak warning moves to tomorrow
    .then(scheduleReminders)
    .then(() => refreshWidgets(['Streak']))
    // storage failed: training still works, it just isn't counted
    .catch(() => {})
}

export const recordPuzzle = (themes: Array<string>, clean: boolean) =>
  save((p) => withPuzzle(p, themes, clean))
export const recordDrill = (slug: string, clean: boolean) =>
  save((p) => withDrill(p, slug, clean))
export const recordGuess = (slug: string, found: number, tried: number) =>
  save((p) => withGuess(p, slug, found, tried))

/**
 * The game against Stockfish, saved on the phone. The website's key has a
 * ":" that the phone's secure store refuses, so the app keeps its own.
 */
export const PHONE_PLAY_KEY = 'misri.play.v1'
