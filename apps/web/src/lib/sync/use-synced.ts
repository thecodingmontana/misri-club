import { useEffect, useState } from 'react'
import { whenClaimed } from '#/lib/session-cache'

/**
 * Rows of a local query, live, once this device has finished its first sync;
 * null before that (and on the server), so pages keep their server data until
 * the local copy can stand in for it.
 */
export function useSyncedQuery<T>(sql: string, params: unknown[] = []) {
  const [rows, setRows] = useState<T[] | null>(null)
  const key = JSON.stringify(params)
  // biome-ignore lint/correctness/useExhaustiveDependencies: params tracked through key
  useEffect(() => {
    const abort = new AbortController()
    void import('./powersync').then(async ({ startSync }) => {
      // a full page load claims the device after mounting: wait for it
      await whenClaimed()
      if (abort.signal.aborted) return
      const db = startSync()
      if (!db) return
      await db.waitForFirstSync(abort.signal)
      if (abort.signal.aborted) return
      db.watch(
        sql,
        params,
        { onResult: (result) => setRows((result.rows?._array ?? []) as T[]) },
        { signal: abort.signal },
      )
    })
    return () => abort.abort()
  }, [sql, key])
  return rows
}
