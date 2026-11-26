import { type ApiClient, ApiError } from '@misri/api-client'
import { QUEUEABLE, QUEUED_LABEL, type Queueable } from '@misri/core/queueable'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import * as Store from '@/lib/storage'

/**
 * Actions taken with no connection (a result report, a walkover, an answer):
 * kept on the phone and sent in order once Misri can be reached, as the
 * website's outbox does. Cleared on sign-out.
 */

type Queued = { name: Queueable; input: unknown; at: number }
const KEY = 'misri.outbox.v1'

async function read(): Promise<Queued[]> {
  try {
    return JSON.parse((await Store.getItemAsync(KEY)) ?? '[]')
  } catch {
    return []
  }
}
const write = (items: Queued[]) =>
  Store.setItemAsync(KEY, JSON.stringify(items)).catch(() => {})

const isQueueable = (name: string): name is Queueable =>
  (QUEUEABLE as readonly string[]).includes(name)

/**
 * Sends now, or keeps it for later when the server can't be reached (only
 * the queueable actions; the server answering "no" is still an error).
 */
export async function sendOrQueue(
  api: ApiClient,
  name: Queueable,
  input: unknown,
): Promise<'sent' | 'queued'> {
  try {
    await api.act(name as never, input as never)
    return 'sent'
  } catch (error) {
    // the server answered: its "no" is for the player now, not later
    if (error instanceof ApiError || !isQueueable(name)) throw error
    await write([...(await read()), { name, input, at: Date.now() }])
    return 'queued'
  }
}

async function tell(title: string, body?: string) {
  if (Platform.OS !== 'android') return
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  }).catch(() => {})
}

let flushing: Promise<void> | null = null

/** Sends what was kept, oldest first; stops at the first that can't reach. */
export function flushOutbox(api: ApiClient) {
  flushing ??= (async () => {
    try {
      let items = await read()
      while (items.length) {
        const [next] = items
        try {
          await api.act(next.name as never, next.input as never)
          await tell(`${QUEUED_LABEL[next.name]} was sent`)
        } catch (error) {
          // offline, or the server failing for now: try again later
          if (!(error instanceof ApiError) || !error.refused) return
          await tell(`${QUEUED_LABEL[next.name]} wasn't sent`, error.message)
        }
        items = items.slice(1)
        await write(items)
      }
    } finally {
      flushing = null
    }
  })()
  return flushing
}

/** Signing out: what was kept belongs to that account. */
export function clearOutbox() {
  return Store.deleteItemAsync(KEY).catch(() => {})
}
