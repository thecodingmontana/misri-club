import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { CopyIcon } from '#/components/copy-icon'
import { CalendarOutline } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { useCopy } from '#/lib/use-copy'
import { getCalendarPathFn } from '#/server/calendar.functions'

/**
 * Subscribe to your match deadlines in your phone's calendar: it reminds you
 * a day before each one and updates as rounds open.
 */
export function CalendarLink() {
  const getPath = useServerFn(getCalendarPathFn)
  const { data } = useQuery({
    queryKey: ['calendar-path'],
    queryFn: () => getPath(),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const { copied, copy } = useCopy()
  if (!data || typeof window === 'undefined') return null
  const url = `${window.location.origin}${data.path}`

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
    </div>
  )
}
