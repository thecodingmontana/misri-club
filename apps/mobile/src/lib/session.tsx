import { type ApiClient, createApiClient } from '@misri/api-client'
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { API_URL, SITE_URL } from './config'

const TOKEN_KEY = 'misri.session'
const RETURN_URL = 'misri://auth'

type Session = {
  /** null: signed out; undefined: still reading the stored one */
  token: string | null | undefined
  api: ApiClient | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/**
 * Signing in: the website does it (Google, emailed link, passkey, two-step),
 * then hands this app a one-time code. PKCE: only this app, holding the
 * verifier, can trade that code for a session token (see
 * apps/web/src/server/app-sign-in.server.ts).
 */
async function signInOnTheWebsite(): Promise<string | null> {
  const verifier = base64url(Crypto.getRandomBytes(48))
  const challenge = (
    await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      {
        encoding: Crypto.CryptoEncoding.BASE64,
      },
    )
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const result = await WebBrowser.openAuthSessionAsync(
    `${SITE_URL}/app-sign-in?challenge=${challenge}`,
    RETURN_URL,
  )
  if (result.type !== 'success') return null
  const code = new URL(result.url).searchParams.get('code')
  if (!code) return null
  const response = await fetch(`${SITE_URL}/api/app/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, verifier }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    token?: string
    error?: string
  }
  if (!response.ok || !body.token) {
    throw new Error(body.error ?? "Couldn't sign in. Try again.")
  }
  return body.token
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((stored) => setToken(stored))
      .catch(() => setToken(null))
  }, [])

  const signIn = useCallback(async () => {
    const fresh = await signInOnTheWebsite()
    if (!fresh) return
    await SecureStore.setItemAsync(TOKEN_KEY, fresh)
    setToken(fresh)
  }, [])

  const signOut = useCallback(async () => {
    if (token) {
      // end the session on the server too; signed out here either way
      await fetch(`${SITE_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          origin: SITE_URL,
        },
        body: '{}',
      }).catch(() => {})
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    setToken(null)
  }, [token])

  const api = useMemo(
    () => (token ? createApiClient({ url: API_URL, token }) : null),
    [token],
  )

  return (
    <SessionContext.Provider value={{ token, api, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession outside SessionProvider')
  return session
}
