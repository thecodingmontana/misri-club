import { type ApiClient, createApiClient, type Me } from '@misri/api-client'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { authClient, sessionToken } from './auth'
import { API_URL } from './config'

type Session = {
  /** null: signed out; undefined: still reading the stored one */
  token: string | null | undefined
  api: ApiClient | null
  /** who is signed in; undefined while loading */
  me: Me | null | undefined
  /** re-read the stored session (after signing in, onboarding…) */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null | undefined>(undefined)

  const api = useMemo(
    () => (token ? createApiClient({ url: API_URL, token }) : null),
    [token],
  )

  const refresh = useCallback(async () => {
    const next = await sessionToken()
    setToken(next)
    if (!next) return setMe(null)
    const client = createApiClient({ url: API_URL, token: next })
    // a token the server no longer knows (signed out elsewhere) signs out here
    setMe(await client.me().catch(() => null))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    await authClient.signOut().catch(() => {})
    setToken(null)
    setMe(null)
  }, [])

  return (
    <SessionContext.Provider value={{ token, api, me, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession outside SessionProvider')
  return session
}
