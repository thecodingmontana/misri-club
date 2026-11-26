// The web preview only: no device notifications, the choice is just kept.
import * as Store from '@/lib/storage'

export interface Reminders {
  puzzleAt: number | null
  streak: boolean
}
const KEY = 'misri.reminders.v1'
// on until switched off: a 6pm daily puzzle and the 8pm streak warning
export const DEFAULT_REMINDERS: Reminders = { puzzleAt: 18, streak: true }
export async function readReminders(): Promise<Reminders> {
  return {
    ...DEFAULT_REMINDERS,
    ...JSON.parse((await Store.getItemAsync(KEY)) ?? 'null'),
  }
}
export async function saveReminders(next: Reminders) {
  await Store.setItemAsync(KEY, JSON.stringify(next))
  return true
}
export async function scheduleReminders() {}
