import { Link } from '@tanstack/react-router'
import { cn } from '#/lib/utils'

export function PlayerLink({
  username,
  className,
  muted,
}: {
  username: string
  className?: string
  muted?: boolean
}) {
  return (
    <Link
      to="/players/$username"
      params={{ username }}
      className={cn(
        'font-medium underline-offset-4 transition-colors hover:text-brass hover:underline',
        muted ? 'text-muted-foreground' : 'text-foreground',
        className,
      )}
    >
      {username}
    </Link>
  )
}
