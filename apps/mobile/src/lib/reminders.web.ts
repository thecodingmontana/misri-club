// The web preview only: no device notifications, the choice is just kept.
import * as Store from '@/lib/storage'

export interface Reminders {
  puzzleAt: number | null
  streak: boolean
}
const KEY = 'misri.reminders.v1'
export const NO_REMINDERS: Reminders = { puzzleAt: null, streak: false }
export async function readReminders(): Promise<Reminders> {
  return {
    ...NO_REMINDERS,
    ...JSON.parse((await Store.getItemAsync(KEY)) ?? 'null'),
  }
}
export async function saveReminders(next: Reminders) {
  await Store.setItemAsync(KEY, JSON.stringify(next))
  return true
}
export async function scheduleReminders() {}
