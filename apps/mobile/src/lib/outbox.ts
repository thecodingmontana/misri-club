import { type ApiClient, ApiError } from '@misri/api-client'
import { QUEUEABLE, QUEUED_LABEL, type Queueable } from '@misri/core/queueable'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import * as Store from './storage'

/**
 * Actions taken with no connection (a result report, a walkover, an answer):
 * kept on the phone and sent in order once Misri can be reached, as the
 * website's outbox does. Cleared on sign-out.
 */

type Queued = { name: Queueable; input: unknown; at: number; id?: string }
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
// items kept before ids existed are told apart by when they were made
const idOf = (item: Queued) => item.id ?? String(item.at)

// every change to the list runs after the one before, so none overwrites another
let chain: Promise<unknown> = Promise.resolve()
function locked<T>(change: () => Promise<T>): Promise<T> {
  const run = chain.then(change, change)
  chain = run.catch(() => {})
  return run
}
// bumped on sign-out: a flush that started before it stops touching the list
let generation = 0

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
  const mine = generation
  try {
    await api.act(name as never, input as never)
    return 'sent'
  } catch (error) {
    // the server answered: its "no" is for the player now, not later
    if (error instanceof ApiError || !isQueueable(name)) throw error
    // signed out while it was sending: it belonged to that account, so it's
    // not kept for whoever signs in next (the player has left the page anyway)
    if (mine !== generation) return 'queued'
    const id = `${Date.now()}:${Math.random().toString(36).slice(2)}`
    await locked(async () =>
      write([...(await read()), { name, input, at: Date.now(), id }]),
    )
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
    const mine = generation
    try {
      while (true) {
        const [next] = await read()
        // emptied, or signed out mid-way: what's left isn't ours to send
        if (!next || mine !== generation) return
        try {
          await api.act(next.name as never, next.input as never)
          await tell(`${QUEUED_LABEL[next.name]} was sent`)
        } catch (error) {
          // offline, or the server failing for now: try again later
          if (!(error instanceof ApiError) || !error.refused) return
          await tell(`${QUEUED_LABEL[next.name]} wasn't sent`, error.message)
        }
        // re-read: something may have been queued while this one was sending
        const removed = await locked(async () => {
          if (mine !== generation) return false
          const items = await read()
          // only the one sent: two old entries can share a timestamp
          const at = items.findIndex((item) => idOf(item) === idOf(next))
          if (at >= 0) items.splice(at, 1)
          // a failed save would send it again and again: stop, try later
          return Store.setItemAsync(KEY, JSON.stringify(items)).then(
            () => true,
            () => false,
          )
        })
        if (!removed) return
      }
    } finally {
      flushing = null
    }
  })()
  return flushing
}

/** Signing out: what was kept belongs to that account. */
export function clearOutbox() {
  generation++
  return locked(() => Store.deleteItemAsync(KEY).catch(() => {}))
}
