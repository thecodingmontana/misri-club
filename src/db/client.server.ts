import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

/**
 * Remote Turso/libSQL. `@libsql/client` speaks the wire protocol to the cloud
 * database, so the built server has no local file dependency at all.
 *
 * Schema is managed by drizzle-kit (`pnpm run db:migrate`) — the runtime client
 * only connects, it never applies migrations.
 */

const url = process.env.DATABASE_PATH ?? ''
const authToken = process.env.DATABASE_AUTH_TOKEN
if (!url) throw new Error('DATABASE_PATH must point at the Turso database URL')

function createDb() {
  const client = createClient({ url, authToken })

  return drizzle(client, { schema })
}

/**
 * Cached on globalThis so Vite's dev-server module reloads don't re-create the
 * client on every reload.
 */
const globalForDb = globalThis as unknown as {
  __misriDb?: ReturnType<typeof createDb>
}

export const db = (globalForDb.__misriDb ??= createDb())

export { schema }
