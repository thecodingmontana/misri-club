import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect } from 'react'
import { InboxSkeleton } from '#/components/skeletons.tsx'
import { relativeTime } from '#/lib/format'
import { seo } from '#/lib/seo'
import { useSyncedQuery } from '#/lib/sync/use-synced'
import { cn } from '#/lib/utils'
import { getInboxFn, markInboxReadFn } from '#/server/inbox.functions'

/** Everything Misri told you, newest first; opening it reads them all. */
export const Route = createFileRoute('/_authed/inbox')({
  pendingComponent: InboxSkeleton,
  head: () =>
    seo({ title: 'Inbox', description: 'Your notifications.', noindex: true }),
  loader: () => getInboxFn(),
  component: Inbox,
})

type LocalNotification = {
  id: string
  title: string
  body: string | null
  url: string
  read_at: string | null
  created_at: string
}

function Inbox() {
  const loaded = Route.useLoaderData()
  // the synced copy once this device has it: works offline, updates live
  const local = useSyncedQuery<LocalNotification>(
    'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50',
  )
  const items = local
    ? local.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        url: n.url,
        readAt: n.read_at,
        createdAt: n.created_at,
      }))
    : loaded
  const markRead = useServerFn(markInboxReadFn)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!items.some((n) => !n.readAt)) return
    if (local) {
      // read on this device now, sent to the server when it can be (offline too)
      void import('#/lib/sync/powersync').then(({ startSync }) =>
        startSync()?.execute(
          'UPDATE notifications SET read_at = ? WHERE read_at IS NULL',
          [new Date().toISOString()],
        ),
      )
      return
    }
    markRead()
      .then(() => queryClient.invalidateQueries({ queryKey: ['unread'] }))
      .catch(() => {})
  }, [items, local, markRead, queryClient])

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
