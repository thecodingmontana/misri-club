import { defineConfig } from 'drizzle-kit'

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
