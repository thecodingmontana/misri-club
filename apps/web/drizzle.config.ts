import { defineConfig } from 'drizzle-kit'

const production = process.env.VERCEL_ENV === 'production'
if (production && !process.env.DIRECT_DATABASE_URL) {
  throw new Error(
    'DIRECT_DATABASE_URL must be set for production migrations: the session pooler (port 5432), not the transaction pooler.',
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    // Migrations go through the session-mode pooler (port 5432), not the
    // transaction pooler the app uses: DDL and drizzle-kit's advisory locking
    // need session state that pgBouncer's transaction mode discards.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  casing: 'snake_case',
})
