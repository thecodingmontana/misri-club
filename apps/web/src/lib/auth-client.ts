import { passkeyClient } from '@better-auth/passkey/client'
import { magicLinkClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  plugins: [twoFactorClient(), passkeyClient(), magicLinkClient()],
})

// Closing the browser's passkey prompt is a choice, not an error worth a toast.
const CANCELLED = new Set(['AUTH_CANCELLED', 'ERROR_CEREMONY_ABORTED'])

export function passkeyCancelled(error: object) {
  return 'code' in error && CANCELLED.has(String(error.code))
}

/** Only same-site relative paths, so `?redirect=` can't become an open redirect. */
export function safePath(path: unknown): string | undefined {
  return typeof path === 'string' &&
    path.startsWith('/') &&
    !/[\t\r\n\\]/.test(path) &&
    new URL(path, 'http://x').host === 'x'
    ? path
    : undefined
}
