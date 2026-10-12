import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { useAvatarUrl } from '#/lib/queries'
import { cn } from '#/lib/utils'

interface PodiumEntry {
  username: string
  points: number
}

/** Top three, leader raised in the middle and burning orange. */
export function Podium({ entries }: { entries: Array<PodiumEntry> }) {
  const [first, second, third] = entries
  if (!first) return null

  return (
    <div className="grid grid-cols-3 items-end gap-2 pt-4">
      <Place entry={second} rank={2} />
      <Place entry={first} rank={1} />
      <Place entry={third} rank={3} />
    </div>
  )
}

function Place({ entry, rank }: { entry?: PodiumEntry; rank: 1 | 2 | 3 }) {
  const src = useAvatarUrl(entry?.username ?? '')
  if (!entry) return <div />
  const leader = rank === 1

  return (
    <Link
      to="/players/$username"
      params={{ username: entry.username }}
      className={cn(
        'group flex min-w-0 flex-col items-center text-center',
        !leader && 'pb-2',
      )}
    >
      <span className="relative">
        <Avatar
          className={cn(
            'border-[3px] bg-card',
            leader ? 'size-24 border-flame' : 'size-[4.5rem] border-primary',
          )}
        >
          <AvatarImage src={src} alt="" />
          <AvatarFallback
            className={cn(
              'display bg-secondary',
              leader ? 'text-2xl text-flame' : 'text-lg text-primary',
            )}
          >
            {entry.username.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'display absolute -top-2.5 left-1/2 grid size-7 -translate-x-1/2 place-items-center rounded-full text-sm ring-[3px] ring-background',
            leader
              ? 'bg-flame text-flame-foreground'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {rank}
        </span>
      </span>
      <span
        className={cn(
          'display numeric mt-2',
          leader ? 'text-2xl text-flame' : 'text-lg text-primary',
        )}
      >
        {entry.points}
      </span>
      <span
        className={cn(
          'w-full truncate font-semibold transition-colors group-hover:text-primary',
          leader ? 'text-sm text-flame' : 'text-[0.8rem]',
        )}
      >
        {entry.username}
      </span>
    </Link>
  )
}
