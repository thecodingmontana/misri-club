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
    // The pooler already multiplexes, so each instance needs only a few
    // connections of its own; Supabase caps client connections fairly low.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: isLocal ? false : 'require',
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
