import { expoClient } from '@better-auth/expo/client'
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import { emailOTPClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { Platform } from 'react-native'
import { GOOGLE_WEB_CLIENT_ID, SITE_URL } from './config'
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

/**
 * "Continue with Google": Android's own account picker gives us a Google ID
 * token for the website's client, which the server checks. No browser, so the
 * website installed as an app can't catch Google's return trip. Falls back to
 * the browser way where the native one can't run.
 * 'signed-in', 'two-factor' (the account has a second step), 'cancelled', or an
 * error sentence.
 */
export async function signInWithGoogle(): Promise<string> {
  return (await nativeGoogle()) ?? browserGoogle()
}

let configured = false

/** null when the native way can't run here (no Play services, app not registered with Google). */
async function nativeGoogle(): Promise<string | null> {
  if (Platform.OS !== 'android' || !GOOGLE_WEB_CLIENT_ID) return null
  if (!configured) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID })
    configured = true
  }
  let token: string | null
  try {
    await GoogleSignin.hasPlayServices()
    const picked = await GoogleSignin.signIn()
    if (!isSuccessResponse(picked)) return 'cancelled'
    token = picked.data.idToken
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      error.code === statusCodes.SIGN_IN_CANCELLED
    ) {
      return 'cancelled'
    }
    return null
  } finally {
    // the account is chosen each time, as on the website
    void GoogleSignin.signOut().catch(() => {})
  }
  if (!token) return null
  const { data, error } = await authClient.signIn.social({
    provider: 'google',
    idToken: { token },
  })
  // a server that doesn't take tokens yet: the browser way still works
  if (error) return null
  return (data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect
    ? 'two-factor'
    : 'signed-in'
}

/** Google's page in an in-app browser, then back here. */
async function browserGoogle(): Promise<string> {
  const { error } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: '/',
  })
  if (error) return authError(error)
  const cookie = await authClient.getCookie()
  if (/session_token=/.test(cookie)) return 'signed-in'
  if (/two_factor=/.test(cookie)) return 'two-factor'
  return 'cancelled'
}
