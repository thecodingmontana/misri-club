import { useCallback, useEffect, useRef, useState } from 'react'
import { readCached, writeCached } from './cache'
import { useSession } from './session'

/**
 * Loads something from the API, again whenever `key` changes; `reload` for
 * pull-to-refresh (resolves false when it failed). A refused token (signed out
 * elsewhere) signs this app out.
 *
 * With `keep`, the last good answer is kept on the phone: shown at once on the
 * next visit, and offline in place of an error, with `savedAt` saying when it
 * was fetched.
 */
export function useLoad<T>(load: () => Promise<T>, key: string, keep?: string) {
  const { signOut, me } = useSession()
  const latest = useRef(load)
  latest.current = load
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const fresh = useRef(false)
  // one account's pages are never shown to another
  const name = keep && me ? `${me.id}.${keep}` : null

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const answer = await latest.current()
      fresh.current = true
      setData(answer)
      setError(null)
      setSavedAt(null)
      if (name && answer) writeCached(name, answer)
      return true
    } catch (e) {
      const message = (e as Error).message
      if (/sign in first/i.test(message)) await signOut()
      setError(message)
      return false
    } finally {
      setLoading(false)
    }
  }, [signOut, name])

  // biome-ignore lint/correctness/useExhaustiveDependencies: key decides when to reload
  useEffect(() => {
    let live = true
    fresh.current = false
    // the kept copy first, so the page shows while the fresh one comes
    if (name)
      void readCached<T>(name).then((kept) => {
        // too late: the fresh answer is already showing
        if (!live || !kept || fresh.current) return
        setData(kept.data)
        setSavedAt(kept.at)
      })
    void reload()
    return () => {
      live = false
    }
  }, [key, reload])

  return { data, error, loading, reload, savedAt }
}
