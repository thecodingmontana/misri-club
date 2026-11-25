import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'

// Placeholders shaped like the real pages, so nothing jumps when data lands.
// Shown by the router only when a page takes over a second (see router.tsx).

const times = (n: number) => Array.from({ length: n }, (_, i) => i)
const card = 'rounded-2xl bg-card shadow-card'

function Loading({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className} role="status" aria-label="Loading">
      {children}
    </div>
  )
}

function Title({ className }: { className?: string }) {
  return <Skeleton className={cn('mx-auto h-8 w-56 rounded-lg', className)} />
}

/** Like CompetitionCard: badge, name, facts, and Join on Discover. */
export function CompetitionCardSkeleton({ action }: { action?: boolean }) {
  return (
    <div className={cn(card, 'flex items-center gap-3 px-4 py-3.5')}>
      <Skeleton className="size-11 shrink-0 rounded-2xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/5 rounded-full" />
        <Skeleton className="h-3 w-4/5 max-w-64 rounded-full" />
      </div>
      {action ? (
        <Skeleton className="h-8 w-16 rounded-full" />
      ) : (
        <Skeleton className="size-4 rounded-full" />
      )}
    </div>
  )
}

function CompetitionList({
  count,
  action,
}: {
  count: number
  action?: boolean
}) {
  return (
    <div className="space-y-3">
      {times(count).map((i) => (
        <CompetitionCardSkeleton key={i} action={action} />
      ))}
    </div>
  )
}

/** Home: title, the create buttons, your competitions. */
export function HomeSkeleton() {
  return (
    <Loading className="space-y-6 pt-2">
      <Title />
      <div className="grid gap-2 sm:grid-cols-3">
        {times(3).map((i) => (
          <Skeleton key={i} className="h-12 rounded-xl sm:h-20" />
        ))}
      </div>
      <CompetitionList count={3} />
    </Loading>
  )
}

/** Discover: title, format chips, open competitions with Join. */
export function DiscoverSkeleton() {
  return (
    <Loading className="space-y-5 pt-2">
      <Title className="w-64" />
      <div className="flex flex-wrap justify-center gap-2">
        {times(5).map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <CompetitionList count={4} action />
    </Loading>
  )
}

/** Inbox: unread dot, title, body, time. */
export function InboxSkeleton() {
  return (
    <Loading className="space-y-4 pt-2">
      <Title className="w-32" />
      <div className="space-y-2">
        {times(6).map((i) => (
          <div key={i} className={cn(card, 'flex gap-3 px-4 py-3')}>
            <Skeleton className="mt-1.5 size-2 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton
                className={cn('h-3.5 rounded-full', i % 2 ? 'w-2/3' : 'w-4/5')}
              />
              <Skeleton className="h-3 w-full rounded-full" />
              <Skeleton className="h-2.5 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  )
}

/** A competition: centred header, tabs, then the table. */
export function CompetitionSkeleton() {
  return (
    <Loading className="space-y-5 pt-2">
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-3 w-48 rounded-full" />
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-3 w-40 rounded-full" />
        <Skeleton className="h-3 w-56 rounded-full" />
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className={cn(card, 'space-y-4 p-4')}>
        {times(6).map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-4 rounded-full" />
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton
              className={cn(
                'h-3.5 flex-1 rounded-full',
                i % 2 ? 'mr-16' : 'mr-6',
              )}
            />
            <Skeleton className="h-3.5 w-8 rounded-full" />
          </div>
        ))}
      </div>
    </Loading>
  )
}

/** A player: avatar, name, three tiles, recent results. */
export function PlayerSkeleton() {
  return (
    <Loading className="space-y-6 pt-2">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-8 w-48 rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {times(3).map((i) => (
          <div
            key={i}
            className={cn(card, 'flex flex-col items-center gap-2 px-3 py-3')}
          >
            <Skeleton className="h-2.5 w-14 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-2.5 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="mb-3 h-5 w-36 rounded-md" />
        <RowsSkeleton count={4} />
      </div>
    </Loading>
  )
}

/** An invite: badge, name, summary, the facts and Join. */
export function InviteSkeleton() {
  return (
    <Loading className="space-y-5 pt-6">
      <div className={cn(card, 'space-y-5 px-4 py-6')}>
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-14 rounded-2xl" />
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-8 w-60 rounded-lg" />
          <Skeleton className="h-3 w-72 max-w-full rounded-full" />
        </div>
        <div className="space-y-4 rounded-xl bg-background px-3 py-3">
          {times(6).map((i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton
                className={cn('h-3 rounded-full', i % 2 ? 'w-28' : 'w-36')}
              />
            </div>
          ))}
        </div>
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </Loading>
  )
}

/** A board page (opening, master game, analysed game): board, then moves. */
export function BoardSkeleton() {
  return (
    <Loading className="space-y-4 pt-2">
      <Title />
      <Skeleton className="aspect-square w-full rounded-xl" />
      <div className="flex justify-center gap-2">
        {times(4).map((i) => (
          <Skeleton key={i} className="size-10 rounded-full" />
        ))}
      </div>
      <RowsSkeleton count={2} />
    </Loading>
  )
}

/** Card rows with an icon, two lines and a trailing bit: games, devices, keys. */
export function RowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="space-y-2" role="status" aria-label="Loading">
      {times(count).map((i) => (
        <li key={i} className={cn(card, 'flex items-center gap-3 px-3 py-2.5')}>
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton
              className={cn('h-3.5 rounded-full', i % 2 ? 'w-1/3' : 'w-1/2')}
            />
            <Skeleton className="h-2.5 w-2/3 rounded-full" />
          </div>
          <Skeleton className="h-3 w-12 rounded-full" />
        </li>
      ))}
    </ul>
  )
}

/** Short plain lines, for settings that are still loading. */
export function LinesSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-2.5 py-1" role="status" aria-label="Loading">
      {times(count).map((i) => (
        <Skeleton
          key={i}
          className={cn('h-3.5 rounded-full', i % 2 ? 'w-1/2' : 'w-3/4')}
        />
      ))}
    </div>
  )
}
