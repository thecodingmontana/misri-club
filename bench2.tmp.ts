import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './src/db/schema'
const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 5, ssl: 'require' })
const marks: Array<[string, number]> = []
let t0 = 0
const g = globalThis as any
g.__misriDb = drizzle(client, { schema, casing: 'snake_case',
  logger: { logQuery: (q: string) => { marks.push([q.slice(0, 38).replace(/\s+/g, ' '), Date.now() - t0]) } } })
const { getLeaderboard } = await import('./src/server/queries.server')
await getLeaderboard()            // warm the pool
marks.length = 0
t0 = Date.now()
await getLeaderboard()
const total = Date.now() - t0
for (const [q, ms] of marks) console.log('  sent @%sms  %s', String(ms).padStart(5), q)
console.log('  TOTAL %dms', total)
process.exit(0)
