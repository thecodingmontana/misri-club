import type {
  Authenticator,
  CrudEntry,
  CrudTransaction,
  ResolveCredentialsOptions,
  UploadMutationsOptions,
} from '@powersync/web'
import { PowerSyncDatabase, UpdateType } from '@powersync/web'
import { toast } from '#/lib/toast'
import { saveAnalysisFn } from '#/server/analysis.functions'
import { markInboxReadFn } from '#/server/inbox.functions'
import { runQueuedActionFn } from '#/server/outbox.functions'
import { QUEUEABLE, QUEUED_LABEL, type Queueable } from './queueable'
import { AppSchema } from './schema'

// Misri's PowerSync client: a SQLite copy of the signed-in player's data in
// the browser, kept in step by the PowerSync service (see the Sync Streams in
// the dashboard). Browser only; the pages still load from the server first.

const ENDPOINT = import.meta.env.VITE_POWERSYNC_URL as string | undefined

// --- Sign-in: Better Auth issues a 15-minute token at /api/auth/token ---

/** Reuses a token until a minute before it expires; the SDK asks again on 401. */
class BetterAuthAuthenticator implements Authenticator {
  private token: { value: string; expiresAt: number } | null = null
  /** Whose data this device holds (the token's subject), once known. */
  userId: string | null = null

  async resolveCredentials({ abort }: ResolveCredentialsOptions) {
    if (this.token && this.token.expiresAt - 60_000 > Date.now()) {
      return this.token.value
    }
    const res = await fetch('/api/auth/token', {
      credentials: 'same-origin',
      signal: abort,
    })
    if (!res.ok) throw new Error(`No sync token (${res.status})`)
    const { token } = (await res.json()) as { token: string }
    const { exp, sub } = JSON.parse(atob(token.split('.')[1] ?? '')) as {
      exp: number
      sub: string
    }
    this.token = { value: token, expiresAt: exp * 1000 }
    this.userId = sub
    return token
  }

  invalidateCredentials() {
    this.token = null
  }
}

// --- Uploads ---

// --- Config ---
// One transaction per uploadData call: the SDK calls again until the queue is
// empty, and a single transaction keeps a failure's blast radius small.
const BATCH_SIZE = 1

// --- What every backend call must resolve to ---
type MutationOutcome =
  | { status: 'success' }
  | { status: 'retryable_error'; message?: string }
  | { status: 'fatal_error'; errorCode?: string; message?: string }

/**
 * Maps one local change onto Misri's backend, through the app's own actions
 * (the same server functions the pages call, so the same sign-in and checks).
 *
 * Written on the device so far: reading the inbox (read_at on notifications)
 * and saving a game's engine scores (game_analyses), plus competition actions
 * taken offline (pending_actions, queued by outbox.ts).
 * Anything else queued is a bug, classified fatal so it can't block the queue.
 * `sent` holds the actions already called for this transaction: reading the
 * inbox changes every unread row, but one call reads them all.
 */
async function callBackendApi(
  mutation: CrudEntry,
  sent: Set<string>,
): Promise<MutationOutcome> {
  const fields = Object.keys(mutation.opData ?? {})
  if (
    mutation.table === 'notifications' &&
    mutation.op === UpdateType.PATCH &&
    fields.length === 1 &&
    fields[0] === 'read_at'
  ) {
    if (sent.has('markInboxRead')) return { status: 'success' }
    try {
      await markInboxReadFn()
      sent.add('markInboxRead')
      return { status: 'success' }
    } catch (error) {
      // offline, signed out for now or a server hiccup: reading the inbox
      // can't be refused for good, so it is always worth another try.
      // shortcut: no retry cap; add one if a write that can be refused lands
      return { status: 'retryable_error', message: String(error) }
    }
  }
  if (mutation.table === 'pending_actions' && mutation.op === UpdateType.PUT) {
    const name = mutation.opData?.name as Queueable
    if (!QUEUEABLE.includes(name)) {
      return { status: 'fatal_error', errorCode: 'unknown_action' }
    }
    try {
      const input = JSON.parse(String(mutation.opData?.input))
      const { refused } = await runQueuedActionFn({ data: { name, input } })
      if (refused) {
        toast.error(`${QUEUED_LABEL[name]} wasn't sent`, { desc: refused })
        return { status: 'fatal_error', errorCode: 'refused', message: refused }
      }
      toast.success(`${QUEUED_LABEL[name]} was sent`)
      return { status: 'success' }
    } catch (error) {
      // offline, signed out for now, or the server failing: try again later
      return { status: 'retryable_error', message: String(error) }
    }
  }
  if (
    mutation.table === 'game_analyses' &&
    (mutation.op === UpdateType.PUT || mutation.op === UpdateType.PATCH) &&
    typeof mutation.opData?.scores === 'string'
  ) {
    // ids are `${user_id}:${game_url}`, and user ids have no colon
    const url = mutation.id.slice(mutation.id.indexOf(':') + 1)
    try {
      await saveAnalysisFn({
        data: { url, scores: JSON.parse(mutation.opData.scores) },
      })
      return { status: 'success' }
    } catch (error) {
      // can't reach the server: try again later. Anything else is the server
      // refusing it; this device keeps its own copy, so it's safe to drop.
      if (error instanceof TypeError || !navigator.onLine) {
        return { status: 'retryable_error', message: String(error) }
      }
      return {
        status: 'fatal_error',
        errorCode: 'analysis_refused',
        message: String(error),
      }
    }
  }
  return {
    status: 'fatal_error',
    errorCode: 'no_write_path',
    message: `${mutation.op} on ${mutation.table} has no write path`,
  }
}

// A change the server keeps failing on (not refusing) is retried for this
// long, then dropped, so one bad change can't hold up everything behind it.
const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000

/** When this transaction first failed, kept across reloads (null: never). */
function failingSince(key: string, now: number | null) {
  try {
    const kept = Number(localStorage.getItem(key)) || null
    if (now === null) localStorage.removeItem(key)
    else if (!kept) localStorage.setItem(key, String(now))
    return kept ?? now
  } catch {
    return now // no storage (private window): retry without a limit
  }
}

// Pulls up to BATCH_SIZE pending transactions, then processes them in order. Within a
// transaction, mutations are applied one at a time so a single rejected mutation can be
// discarded without blocking the rest of that transaction or anything queued after it. The first
// retryable_error stops processing and throws. Anything not yet completed stays in the queue
// for the next attempt, which is what makes PowerSync retry, for up to GIVE_UP_AFTER_MS.
// Refused queued actions are logged on the server (outbox.functions.ts) and shown to the player.
async function uploadData({ database }: UploadMutationsOptions): Promise<void> {
  const transactions: CrudTransaction[] = []

  for await (const transaction of database.getCrudTransactions()) {
    transactions.push(transaction)
    if (transactions.length >= BATCH_SIZE) break
  }
  if (transactions.length === 0) return

  for (const transaction of transactions) {
    const key = `misri-upload-failing:${transaction.transactionId ?? transaction.crud[0]?.clientId}`
    const sent = new Set<string>()
    for (const mutation of transaction.crud) {
      const outcome = await callBackendApi(mutation, sent)

      if (outcome.status === 'success') {
        continue
      }

      if (outcome.status === 'fatal_error') {
        // The backend said this exact mutation can never succeed as sent. Retrying it would block
        // the queue forever, so log it and move on.
        console.error(
          'Discarding a mutation the backend rejected',
          mutation,
          outcome,
        )
        continue
      }

      const since = failingSince(key, Date.now()) ?? Date.now()
      if (Date.now() - since > GIVE_UP_AFTER_MS) {
        console.error(
          'Giving up on a mutation after a day of failures',
          mutation,
          outcome,
        )
        if (mutation.table === 'pending_actions') {
          const name = mutation.opData?.name as Queueable
          toast.error(`${QUEUED_LABEL[name] ?? 'A change'} couldn't be sent`, {
            desc: 'The server kept failing for a day. Please do it again.',
          })
        }
        continue
      }

      // retryable_error: throwing makes the PowerSync SDK call uploadData again after a delay.
      // This transaction, and everything queued after it, is left uncompleted on purpose.
      throw new Error(
        `Retryable error uploading transaction: ${outcome.message ?? 'unknown'}`,
      )
    }

    // Every mutation in this transaction is now applied or discarded, so the queue can move
    // past it.
    await transaction.complete()
    failingSince(key, null)
  }
}

// --- The database ---

let db: PowerSyncDatabase | null = null
const authenticator = new BetterAuthAuthenticator()

/** The local database, connected to sync; null on the server or without an instance. */
export function startSync(): PowerSyncDatabase | null {
  if (typeof window === 'undefined' || !ENDPOINT) return null
  if (!db) {
    db = new PowerSyncDatabase({
      schema: AppSchema,
      // OPFS where the browser has it, else in memory (PowerSync's 'auto')
      database: { dbFilename: 'misri.sqlite', vfs: 'auto' },
    })
    void db.connect({
      powerSyncEndpoint: ENDPOINT,
      authenticator,
      upload: uploadData,
    })
  }
  return db
}

/**
 * Keeps a game's engine scores in the synced copy, sent to the account when
 * the server can be reached. False before this device's first sync: the caller
 * then saves straight to the server.
 */
export async function saveAnalysisOnDevice(url: string, scores: unknown[]) {
  const userId = authenticator.userId
  if (!db?.currentStatus.hasSynced || !userId) return false
  const id = `${userId}:${url}`
  const json = JSON.stringify(scores)
  await db.writeTransaction(async (tx) => {
    const { rowsAffected } = await tx.execute(
      'UPDATE game_analyses SET scores = ? WHERE id = ?',
      [json, id],
    )
    if (!rowsAffected) {
      await tx.execute(
        'INSERT INTO game_analyses (id, user_id, game_url, scores) VALUES (?, ?, ?, ?)',
        [id, userId, url, json],
      )
    }
  })
  return true
}

/** Signing out: stop syncing and wipe this device's copy, queue included. */
export async function stopSync() {
  authenticator.invalidateCredentials()
  if (!db) return
  const closing = db
  db = null
  await closing.disconnectAndClear()
  await closing.close()
}
