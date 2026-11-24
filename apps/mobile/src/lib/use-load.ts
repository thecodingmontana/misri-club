import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from './session'

/**
 * Loads something from the API, again whenever `key` changes; `reload` for
 * pull-to-refresh. A refused token (signed out elsewhere) signs this app out.
 */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const { signOut } = useSession()
  const latest = useRef(load)
  latest.current = load
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await latest.current())
      setError(null)
    } catch (e) {
      const message = (e as Error).message
      if (/sign in first/i.test(message)) await signOut()
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [signOut])

  // biome-ignore lint/correctness/useExhaustiveDependencies: key decides when to reload
  useEffect(() => {
    void reload()
  }, [key, reload])

  return { data, error, loading, reload }
}
