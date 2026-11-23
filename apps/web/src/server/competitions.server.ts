import { getRequestHeaders } from '@tanstack/react-start/server'
import type { Viewer } from '#/lib/access'
import { auth, isAdminEmail } from './auth.server'

// Lives in packages/core so the API shares it; who's asking comes from this
// app's request.
export * from '@misri/core/competitions'

/** The signed-in viewer's id, or null; for pages anyone may read. */
export async function viewerId() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session?.user.id ?? null
}

/** The signed-in viewer with their site role, or null. */
export async function currentViewer(): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session
    ? { id: session.user.id, isAdmin: isAdminEmail(session.user) }
    : null
}
