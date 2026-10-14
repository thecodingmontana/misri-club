import { useQuery } from '@tanstack/react-query'
import { createContext, use } from 'react'
import { cn } from '#/lib/utils'
import { getPlayerRatingsFn } from '#/server/league.functions'

interface RatingEntry {
  username: string
  rating: number | null
  timeClass: 'rapid' | 'blitz' | 'bullet' | 'daily' | null
}

/**
 * Live ratings come from our own server function, which is the one talking to
 * chess.com. One batched request covers the whole board.
 */
export function usePlayerRatings(usernames: Array<string>) {
  const key = [...usernames].sort()

  return useQuery({
    queryKey: ['player-ratings', key],
    queryFn: () => getPlayerRatingsFn({ data: { usernames: key } }),
    enabled: key.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

const RatingsContext = createContext<{
  ratings: Record<string, RatingEntry> | undefined
  isLoading: boolean
}>({ ratings: undefined, isLoading: false })

export function RatingsProvider({
  usernames,
  children,
}: {
  usernames: Array<string>
  children: React.ReactNode
}) {
  const { data, isLoading } = usePlayerRatings(usernames)
  return (
    <RatingsContext value={{ ratings: data, isLoading }}>
      {children}
    </RatingsContext>
  )
}

export function LiveRating({
  username,
  className,
}: {
  username: string
  className?: string
}) {
  const { ratings, isLoading } = use(RatingsContext)

  if (isLoading && !ratings) {
    // A span, not shadcn's <div>-based Skeleton: this renders inline inside
    // paragraphs, and a <div> in a <p> is invalid HTML that breaks hydration.
    return (
      <span
        aria-hidden
        className={cn(
          'inline-block h-3.5 w-8 animate-pulse rounded bg-accent align-middle',
          className,
        )}
      />
    )
  }

  const entry = ratings?.[username]
  if (!entry?.rating) {
    return (
      <span className={cn('numeric text-muted-foreground/60', className)}>
        —
      </span>
    )
  }

  return (
    <span
      className={cn('numeric tabular-nums', className)}
      title={`${entry.timeClass} rating from chess.com`}
    >
      {entry.rating}
    </span>
  )
}
