import { type ApiClient, createApiClient, type Me } from '@misri/api-client'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { authClient, sessionToken } from './auth'
import { cacheGeneration, clearCached, readCached, writeCached } from './cache'
import { API_URL } from './config'
import { clearGames } from './my-games'
import { clearOutbox } from './outbox'

type Session = {
  /** null: signed out; undefined: still reading the stored one */
  token: string | null | undefined
  api: ApiClient | null
  /** who is signed in; undefined while loading */
  me: Me | null | undefined
  /** signed in, but the server couldn't be reached and nothing was kept */
  unreachable: boolean
  /** re-read the stored session (after signing in, onboarding…) */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [unreachable, setUnreachable] = useState(false)
  // the latest refresh decides; an older one finishing last is ignored
  const latestRun = useRef(0)

  const api = useMemo(
    () => (token ? createApiClient({ url: API_URL, token }) : null),
    [token],
  )

  const refresh = useCallback(async () => {
    const run = ++latestRun.current
    const next = await sessionToken()
    setToken(next)
    if (!next) {
      setUnreachable(false)
      return setMe(null)
    }
    const client = createApiClient({ url: API_URL, token: next })
    const since = cacheGeneration()
    try {
      // null: a token the server no longer knows (signed out elsewhere)
      const fresh = await client.me()
      if (run !== latestRun.current) return
      // the message stays up while retrying, and goes with the answer
      setUnreachable(false)
      setMe(fresh)
      // null too: a refused session can't come back from the copy offline
      writeCached('me', fresh, since)
    } catch {
      // unreachable (offline): still signed in, as last seen
      const kept = (await readCached<Me>('me'))?.data ?? null
      if (run !== latestRun.current) return
      setMe(kept)
      // still signed in: say we can't reach Misri, don't ask to sign in again
      if (!kept) setUnreachable(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    // a session check still on its way must not bring the old account back
    latestRun.current++
    await authClient.signOut().catch(() => {})
    // pages kept for offline belong to this account only
    clearCached()
    await clearGames()
    await clearOutbox()
    setToken(null)
    setMe(null)
    setUnreachable(false)
  }, [])

  return (
    <SessionContext.Provider
      value={{ token, api, me, unreachable, refresh, signOut }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession outside SessionProvider')
  return session
}
