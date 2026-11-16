import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect } from 'react'
import { toast } from '#/lib/toast'
import { syncMineFn } from '#/server/competitions.functions'

const EVERY_MS = 2 * 60 * 1000

/**
 * Keeps results fresh on every page: syncs the player's running competitions
 * with chess.com on open, on return, and every two minutes while visible, and
 * refreshes the page in place when something changed.
 */
export function useAutoSync(enabled: boolean) {
  const sync = useServerFn(syncMineFn)
  const router = useRouter()
  useEffect(() => {
    if (!enabled) return
    let running = false
    const run = async () => {
      if (running || document.visibilityState !== 'visible') return
      running = true
      try {
        const { changed } = await sync()
        if (changed > 0) {
          await router.invalidate()
          toast.success(
            changed === 1
              ? 'A new result came in'
              : `${changed} new results came in`,
          )
        }
      } catch {
        // offline or signed out mid-way: try again next time
      } finally {
        running = false
      }
    }
    void run()
    const id = setInterval(run, EVERY_MS)
    document.addEventListener('visibilitychange', run)
    addEventListener('focus', run)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', run)
      removeEventListener('focus', run)
    }
  }, [enabled, sync, router])
}
