import { expoClient } from '@better-auth/expo/client'
import { emailOTPClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { SITE_URL } from './config'
import * as SecureStore from './storage'

/**
 * Misri's accounts (Better Auth on the website), signed in from the app with a
 * 6-digit code by email, then the authenticator-app step when the account has
 * one. The Expo plugin keeps the session cookie in SecureStore.
 */
export const authClient = createAuthClient({
  baseURL: SITE_URL,
  plugins: [
    expoClient({
      scheme: 'misri',
      storagePrefix: 'misri',
      storage: SecureStore,
    }),
    emailOTPClient(),
    twoFactorClient(),
  ],
})

/** The signed session token from the stored cookie: the API's Bearer token. */
export async function sessionToken(): Promise<string | null> {
  const cookie = await authClient.getCookie()
  const match = /session_token=([^;]+)/.exec(cookie)
  return match ? decodeURIComponent(match[1]) : null
}

/** Better Auth's error, as a sentence for the player. */
export function authError(error: { message?: string } | null | undefined) {
  return error?.message || 'Something went wrong. Try again.'
}
