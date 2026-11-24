import type {
  Authenticator,
  CrudEntry,
  CrudTransaction,
  ResolveCredentialsOptions,
  UploadMutationsOptions,
} from '@powersync/web'
import { PowerSyncDatabase } from '@powersync/web'
import { AppSchema } from './schema'

// Misri's PowerSync client: a SQLite copy of the signed-in player's data in
// the browser, kept in step by the PowerSync service (see the Sync Streams in
// the dashboard). Browser only; the pages still load from the server first.

const ENDPOINT = import.meta.env.VITE_POWERSYNC_URL as string | undefined

// --- Sign-in: Better Auth issues a 15-minute token at /api/auth/token ---

/** Reuses a token until a minute before it expires; the SDK asks again on 401. */
class BetterAuthAuthenticator implements Authenticator {
  private token: { value: string; expiresAt: number } | null = null

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
    const { exp } = JSON.parse(atob(token.split('.')[1] ?? '')) as {
      exp: number
    }
    this.token = { value: token, expiresAt: exp * 1000 }
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
 * Maps one local change onto Misri's backend.
 *
 * Misri doesn't write synced tables from the browser yet: every change still
 * goes through the app's own actions (report a result, mark the inbox read…),
 * online. So no table has a write path here, and any queued change is a bug —
 * classified fatal so it is logged and can never block the queue.
 *
 * Follow-up (agreed write scope): POST each change to a dedicated upload
 * endpoint that runs the matching action and answers 200 applied / 422
 * rejected for good / 401 signed out / 5xx try again, then map those here.
 */
async function callBackendApi(mutation: CrudEntry): Promise<MutationOutcome> {
  return {
    status: 'fatal_error',
    errorCode: 'no_write_path',
    message: `${mutation.op} on ${mutation.table} has no write path yet`,
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
    for (const mutation of transaction.crud) {
      const outcome = await callBackendApi(mutation)

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

/** Signing out: stop syncing and wipe this device's copy, queue included. */
export async function stopSync() {
  authenticator.invalidateCredentials()
  if (!db) return
  const closing = db
  db = null
  await closing.disconnectAndClear()
  await closing.close()
}
