import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect } from 'react'
import { relativeTime } from '#/lib/format'
import { seo } from '#/lib/seo'
import { cn } from '#/lib/utils'
import { getInboxFn, markInboxReadFn } from '#/server/inbox.functions'

/** Everything Misri told you, newest first; opening it reads them all. */
export const Route = createFileRoute('/_authed/inbox')({
  head: () =>
    seo({ title: 'Inbox', description: 'Your notifications.', noindex: true }),
  loader: () => getInboxFn(),
  component: Inbox,
})

function Inbox() {
  const items = Route.useLoaderData()
  const markRead = useServerFn(markInboxReadFn)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!items.some((n) => !n.readAt)) return
    markRead()
      .then(() => queryClient.invalidateQueries({ queryKey: ['unread'] }))
      .catch(() => {})
  }, [items, markRead, queryClient])

  return (
    <div className="space-y-4 pt-2">
      <h1 className="display text-center text-3xl">Inbox</h1>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
          Nothing yet. Starts, results, reminders and requests show up here.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                to={n.url}
                className="flex gap-3 rounded-2xl bg-card px-4 py-3 shadow-card transition-colors duration-150 hover:bg-secondary"
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    n.readAt ? 'bg-transparent' : 'bg-primary',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{n.title}</span>
                  {n.body && (
                    <span className="block text-sm text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                  <span
                    className="mt-0.5 block text-xs text-muted-foreground"
                    // "just now" can become "1 minute ago" before hydration
                    suppressHydrationWarning
                  >
                    {n.readAt ? '' : 'New · '}
                    {relativeTime(n.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
