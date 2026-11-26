import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { readProgress, streak, streakWarningAt } from '@/lib/progress'
import * as Store from '@/lib/storage'

/**
 * Training reminders, scheduled on the phone itself (no server, no FCM): a
 * daily puzzle at the hour you choose, and "your streak ends tonight" at 8pm
 * on a day you haven't trained yet.
 */

export interface Reminders {
  /** hour of the day for the daily puzzle, or null for none */
  puzzleAt: number | null
  streak: boolean
}

const KEY = 'misri.reminders.v1'
const CHANNEL = 'training'
// set for everyone who allows notifications: an 8am puzzle, the 8pm warning
export const DEFAULT_REMINDERS: Reminders = { puzzleAt: 8, streak: true }
const OFF: Reminders = { puzzleAt: null, streak: false }

export async function readReminders(): Promise<Reminders> {
  try {
    const stored = JSON.parse((await Store.getItemAsync(KEY)) ?? 'null')
    return stored ? { ...OFF, ...stored } : OFF
  } catch {
    return OFF
  }
}

/**
 * The first time the app is opened (after it asked for notifications): the
 * defaults when they were allowed, off when not. Never touches a choice made.
 */
export async function firstReminders() {
  if (Platform.OS !== 'android') return
  if (await Store.getItemAsync(KEY).catch(() => null)) return
  const { granted } = await Notifications.getPermissionsAsync()
  await Store.setItemAsync(
    KEY,
    JSON.stringify(granted ? DEFAULT_REMINDERS : OFF),
  )
}

/** Saves the choice and schedules it; false when notifications are refused. */
export async function saveReminders(next: Reminders): Promise<boolean> {
  if (next.puzzleAt !== null || next.streak) {
    const { granted } = await Notifications.requestPermissionsAsync()
    if (!granted) return false
  }
  await Store.setItemAsync(KEY, JSON.stringify(next))
  await scheduleReminders()
  return true
}

/** Puts the reminders on the phone's schedule; after any training too. */
export async function scheduleReminders() {
  if (Platform.OS !== 'android') return
  const [settings, progress] = await Promise.all([
    readReminders(),
    readProgress(),
  ])
  await Notifications.cancelScheduledNotificationAsync('daily-puzzle')
  await Notifications.cancelScheduledNotificationAsync('streak-end')
  if (settings.puzzleAt === null && !settings.streak) return
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Training reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
  if (settings.puzzleAt !== null) {
    await Notifications.scheduleNotificationAsync({
      identifier: 'daily-puzzle',
      content: {
        title: 'Your daily puzzle',
        body: 'One tactic, a minute or two. Can you find the best move?',
        data: { url: '/train/puzzles' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: settings.puzzleAt,
        minute: 0,
        channelId: CHANNEL,
      },
    })
  }
  const at = settings.streak ? streakWarningAt(progress.days) : null
  if (at) {
    // the streak as it will stand that evening, if you train no more
    const days = streak(progress.days, at.toLocaleDateString('en-CA')) || 1
    await Notifications.scheduleNotificationAsync({
      identifier: 'streak-end',
      content: {
        title: `Your ${days}-day streak ends tonight`,
        body: 'Solve one puzzle to keep it going.',
        data: { url: '/train/puzzles' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: CHANNEL,
      },
    })
  }
}
