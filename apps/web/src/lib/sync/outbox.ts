import type { ActionInput } from '@misri/core/actions'
import { toast } from '#/lib/toast'
import type { Queueable } from './queueable'

/**
 * Takes an action now, or, offline on a synced device, queues it to be sent
 * when the device is back (PowerSync's upload queue; see powersync.ts).
 * 'queued' means it hasn't reached the server yet: the page won't show it.
 */
export async function sendOrQueue<N extends Queueable>(
  name: N,
  input: ActionInput<N>,
  send: () => Promise<unknown>,
): Promise<'sent' | 'queued'> {
  if (navigator.onLine) {
    try {
      await send()
      return 'sent'
    } catch (error) {
      // a fetch that never got an answer: queue it; anything else is the answer
      if (!(error instanceof TypeError)) throw error
    }
  }
  const { startSync } = await import('./powersync')
  const db = startSync()
  if (!db?.currentStatus.hasSynced) {
    throw new Error("You're offline. Try again once you're back online.")
  }
  await db.execute(
    'INSERT INTO pending_actions (id, name, input) VALUES (uuid(), ?, ?)',
    [name, JSON.stringify(input)],
  )
  toast.info('Saved on this device', {
    desc: "It's sent as soon as you're back online.",
  })
  return 'queued'
}

/** How many changes this device hasn't sent yet. */
export async function unsentChanges() {
  const { startSync } = await import('./powersync')
  const db = startSync()
  return db ? (await db.getUploadQueueStats()).count : 0
}

/**
 * Before signing out: signing out wipes this device's copy, unsent changes
 * included, so with any waiting it asks first. False: don't sign out yet.
 */
export async function readyToSignOut(signOutAnyway: () => void) {
  const count = await unsentChanges().catch(() => 0)
  if (count === 0) return true
  toast.error(
    `${count} change${count === 1 ? " hasn't" : "s haven't"} been sent yet`,
    {
      desc: 'Signing out now drops them. Go back online first to send them.',
      action: { label: 'Sign out anyway', onClick: signOutAnyway },
      duration: 10_000,
    },
  )
  return false
}
