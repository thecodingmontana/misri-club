import { db } from '@misri/db/client'
import { session } from '@misri/db/schema'
import { and, eq, gt } from 'drizzle-orm'

export type Viewer = { id: string }

/**
 * `Authorization: Bearer <session token>`: a Better Auth session from the web
 * app's sign-in. The signed cookie value (`token.signature`) works too; the
 * token alone is the secret, so its signature isn't needed here.
 */
export async function viewerFrom(headers: Headers): Promise<Viewer | null> {
  const match = headers.get('authorization')?.match(/^Bearer\s+([^\s.]+)/i)
  if (!match) return null
  const [row] = await db
    .select({ id: session.userId })
    .from(session)
    .where(and(eq(session.token, match[1]), gt(session.expiresAt, new Date())))
    .limit(1)
  return row ?? null
}
