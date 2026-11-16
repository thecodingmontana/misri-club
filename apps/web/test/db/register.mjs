import { register } from 'node:module'

// These tests write and delete rows: never let them near a shared database.
process.env.DATABASE_URL ??= 'postgres://postgres:misri@127.0.0.1:5434/misri'
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL)) {
  throw new Error('test:db only runs against a local database')
}
register('./loader.mjs', import.meta.url)
