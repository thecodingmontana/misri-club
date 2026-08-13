import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { cn } from '#/lib/utils'

/**
 * Avatar + username, linking to the player's profile. The one place player
 * identity is rendered, so it stays consistent across every screen.
 */
export function PlayerChip({
  username,
  avatar,
  size = 'md',
  className,
  muted,
  stacked,
}: {
  username: string
  avatar?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
  muted?: boolean
  /** Avatar above the name, as on the "upcoming match" card. */
  stacked?: boolean
}) {
  const avatarSize =
    size === 'lg' ? 'size-14' : size === 'sm' ? 'size-6' : 'size-8'

  return (
    <Link
      to="/players/$username"
      params={{ username }}
      className={cn(
        'group flex min-w-0 items-center gap-2',
        stacked && 'flex-col gap-1.5 text-center',
        className,
      )}
    >
      <Avatar className={cn(avatarSize, 'border border-border/70')}>
        {avatar && <AvatarImage src={avatar} alt="" />}
        <AvatarFallback className="bg-secondary text-[0.65rem] font-semibold text-brass">
          {username.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(
          'min-w-0 truncate font-medium transition-colors group-hover:text-brass',
          size === 'lg' ? 'text-sm' : 'text-[0.82rem]',
          muted ? 'text-muted-foreground' : 'text-foreground',
          stacked && 'max-w-[6.5rem]',
        )}
      >
        {username}
      </span>
    </Link>
  )
}
