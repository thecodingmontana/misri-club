import { createAuth } from '@misri/auth'
import type { Viewer } from '@misri/core/access'
import { isAdminEmail } from '@misri/core/admin'

export type { Viewer }

/**
 * The web app's Better Auth, checking sessions only: no sign-in here (that
 * happens on the website, whose pages finish the emailed-link and two-step
 * flows), and no account deletion.
 */
const auth = createAuth()

/**
 * `Authorization: Bearer <token>`: the signed token sign-in returns in its
 * `set-auth-token` header (the same value as the session cookie).
 */
export async function viewerFrom(headers: Headers): Promise<Viewer | null> {
  if (!headers.get('authorization')) return null
  const session = await auth.api.getSession({ headers })
  return session
    ? {
        id: session.user.id,
        isAdmin: isAdminEmail(session.user),
        sessionId: session.session.id,
      }
    : null
}
