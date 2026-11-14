import { useEffect, useState } from 'react'
import { toast } from '#/lib/toast'

const SHOW_COPIED_MS = 2000

/**
 * Copy text; `copied` stays true for two seconds so the button can show a
 * tick instead of a toast. Only a failure is announced.
 */
export function useCopy() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), SHOW_COPIED_MS)
    return () => clearTimeout(id)
  }, [copied])

  async function copy(text: string, failure = "Couldn't copy") {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      toast.error(failure)
    }
  }

  return { copied, copy }
}
