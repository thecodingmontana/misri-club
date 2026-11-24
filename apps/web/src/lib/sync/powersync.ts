import type {
  Authenticator,
  CrudEntry,
  CrudTransaction,
  ResolveCredentialsOptions,
  UploadMutationsOptions,
} from '@powersync/web'
import { PowerSyncDatabase, UpdateType } from '@powersync/web'
import { saveAnalysisFn } from '#/server/analysis.functions'
import { markInboxReadFn } from '#/server/inbox.functions'
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
 * and saving a game's engine scores (game_analyses).
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

// Pulls up to BATCH_SIZE pending transactions, then processes them in order. Within a
// transaction, mutations are applied one at a time so a single rejected mutation can be
// discarded without blocking the rest of that transaction or anything queued after it. The first
// retryable_error stops processing and throws. Anything not yet completed stays in the queue
// for the next attempt, which is what makes PowerSync retry.
//
// Hardening follow-ups (not built yet, see the PowerSync write-path docs):
// - retry cap: a persisted per-transaction attempt counter, so a backend that
//   answers 5xx for a permanent failure can't block the queue forever;
// - dead-letter storage: keep rejected mutations in a server table instead of
//   only logging them;
// - client status in logs: ship the table, op, id and sync status with each
//   failure so a stuck queue on one device is visible from the server.
async function uploadData({ database }: UploadMutationsOptions): Promise<void> {
  const transactions: CrudTransaction[] = []

  for await (const transaction of database.getCrudTransactions()) {
    transactions.push(transaction)
    if (transactions.length >= BATCH_SIZE) break
  }
  if (transactions.length === 0) return

  for (const transaction of transactions) {
    const sent = new Set<string>()
    for (const mutation of transaction.crud) {
      const outcome = await callBackendApi(mutation, sent)

      if (outcome.status === 'success') {
        continue
      }

      if (outcome.status === 'fatal_error') {
        // The backend said this exact mutation can never succeed as sent. Retrying it would block
        // the queue forever, so log it as an error and move on. The log line is how you find out
        // about the bug that caused it. If discarding the mutation is unacceptable,
        // add the dead-letter storage described above.
        console.error(
          'Discarding a mutation the backend rejected',
          mutation,
          outcome,
        )
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
