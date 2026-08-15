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
     * A big `max` multiplies across instances and exhausts the pooler's client
     * slots, so this stays small. It cannot be 1 on Vercel, though: Fluid
     * Compute runs concurrent requests inside a shared isolate, so a single
     * connection serialises every query of every in-flight request behind one
     * another. A page that issues five queries then waits five times its own
     * depth, which is how requests end up exceeding the statement timeout.
     */
    max: process.env.VERCEL ? 3 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    /**
     * Recycle connections rather than holding them for the life of the process.
     * The shared pooler has a finite number of client slots across all its
     * tenants, and a dev server that reloads all day will otherwise sit on
     * slots it is no longer using.
     */
    max_lifetime: 60 * 30,
    ssl: isLocal ? false : 'require',
    connection: {
      /**
       * Without this a query that stalls — a lock, a pooler hiccup — hangs the
       * request forever, which shows up as a page that spins and never
       * resolves. Ten seconds is far longer than any query here should take,
       * so hitting it means something is wrong and failing loudly beats
       * hanging silently.
       */
      statement_timeout: 10_000,
    },
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
