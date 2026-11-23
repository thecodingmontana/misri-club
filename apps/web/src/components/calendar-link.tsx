import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { CopyIcon } from '#/components/copy-icon'
import { CalendarOutline } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { toast } from '#/lib/toast'
import { useCopy } from '#/lib/use-copy'
import {
  getCalendarPathFn,
  resetCalendarPathFn,
} from '#/server/calendar.functions'

/**
 * Subscribe to your match deadlines in your phone's calendar: it reminds you
 * a day before each one and updates as rounds open.
 */
export function CalendarLink() {
  const getPath = useServerFn(getCalendarPathFn)
  const resetPath = useServerFn(resetCalendarPathFn)
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['calendar-path'],
    queryFn: () => getPath(),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const { copied, copy } = useCopy()
  if (!data || typeof window === 'undefined') return null
  const url = `${window.location.origin}${data.path}`

  // for a link that got shared or posted: the old one stops working
  async function reset() {
    try {
      queryClient.setQueryData(['calendar-path'], await resetPath())
      toast.success('New link made. Add it to your calendar again.')
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button asChild className="flex-1">
        <a href={url.replace(/^https?:/, 'webcal:')}>
          <CalendarOutline className="size-4" aria-hidden />
          Add to calendar
        </a>
      </Button>
      <Button
        variant="outline"
        className="flex-1"
        onClick={() => copy(url, "Couldn't copy the link.")}
      >
        <CopyIcon copied={copied} />
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <Button variant="ghost" className="sm:flex-none" onClick={reset}>
        Reset link
      </Button>
    </div>
  )
}
