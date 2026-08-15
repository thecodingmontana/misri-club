import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * PostgreSQL over postgres-js, pointed at Supabase's transaction-mode pooler.
 * Schema is managed by drizzle-kit (`pnpm run db:migrate`) against the *session*
 * pooler — the runtime client only connects, it never applies migrations.
 */

const url = process.env.DATABASE_URL ?? ''
if (!url) throw new Error('DATABASE_URL must point at the PostgreSQL database')

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url)

function createDb() {
  const client = postgres(url, {
    /**
     * Mandatory on a transaction-mode pooler. pgBouncer hands each transaction
     * whichever backend connection is free, so a statement prepared on one
     * connection is not there on the next — leaving this on produces
     * intermittent "prepared statement does not exist" errors under load.
     */
    prepare: false,
    /**
     * One in-flight query per connection. postgres-js otherwise stacks up to
     * 100 queries onto a single connection, and pgBouncer in transaction mode
     * cannot follow a pipelined extended-protocol exchange: it loses track of
     * where each transaction ends, and the backend is left `active` on
     * `ClientRead`, waiting for a message the client already believes it sent.
     * The request never completes.
     *
     * This is why the app only broke when two requests overlapped — a single
     * request in isolation never had anything to pipeline against.
     */
    max_pipeline: 1,
    /**
     * A big `max` multiplies across instances and exhausts the pooler's client
     * slots, so this stays small. It cannot be 1 on Vercel, though: Fluid
     * Compute runs concurrent requests inside a shared isolate, so a single
     * connection serialises every query of every in-flight request behind one
     * another. A page that issues five queries then waits five times its own
     * depth, which is how requests end up exceeding the statement timeout.
     */
    /**
     * With pipelining off, a connection serves one query at a time, so this is
     * the number of requests an isolate can have in flight before they queue.
     */
    max: process.env.VERCEL ? 6 : 5,
    /**
     * Deliberately short, and the reason is Fluid Compute rather than the
     * database. Vercel freezes a warm isolate between requests; the TCP sockets
     * this pool is holding do not survive that, but the pool has no way to know
     * — it hands out a dead socket, writes a query into it and waits for a
     * reply that cannot arrive. postgres-js has no client-side query timeout,
     * so that wait is unbounded and the request hangs until Vercel kills it at
     * 300s. Postgres shows these as `active` + `ClientRead`: the query is long
     * finished and the server is waiting on a client that is never coming back.
     *
     * Closing idle connections quickly means a frozen isolate almost never has
     * one left to poison, and reconnecting is cheap because the functions run
     * in the same region as the database.
     */
    idle_timeout: 5,
    connect_timeout: 15,
    /**
     * Recycle connections rather than holding them for the life of the process.
     * The shared pooler has a finite number of client slots across all its
     * tenants, and a dev server that reloads all day will otherwise sit on
     * slots it is no longer using.
     */
    max_lifetime: 60 * 30,
    ssl: isLocal ? false : 'require',
    /**
     * Probe idle sockets aggressively so the OS surfaces a dead peer as a
     * connection error the pool can react to, instead of a silent black hole.
     */
    keep_alive: 10,
  })

  return drizzle(client, { schema, casing: 'snake_case' })
}

/**
 * Cached on globalThis so Vite's dev-server module reloads don't open a new
 * connection pool on every reload.
 */
const globalForDb = globalThis as unknown as {
  __misriDb?: ReturnType<typeof createDb>
}

export const db = (globalForDb.__misriDb ??= createDb())

export { schema }
