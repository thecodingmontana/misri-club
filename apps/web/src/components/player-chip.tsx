import { useEffect, useRef, useState } from 'react'
import { avatarUrl } from '#/lib/avatar'
import { cn } from '#/lib/utils'

/**
 * A player's face, always: their account picture, or the DiceBear portrait
 * seeded by their name when they have none or it fails to load. A plain `<img>`
 * rather than Radix Avatar, so it renders on the server instead of flashing
 * initials until the picture arrives.
 */
export function PlayerAvatar({
  username,
  image,
  className,
  shape = 'circle',
}: {
  username: string
  image?: string | null
  className?: string
  /** `tile`: a rounded square on a raised plate, as on the match cards. */
  shape?: 'circle' | 'tile'
}) {
  const src = avatarUrl(username, image)
  const [failed, setFailed] = useState<string | null>(null)
  const shown = failed === src ? avatarUrl(username) : src
  const ref = useRef<HTMLImageElement>(null)

  // An error before hydration never reaches `onError`; catch it here.
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth === 0) setFailed(src)
  }, [src])

  const picture = (
    <img
      ref={ref}
      src={shown}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(src)}
      className={cn(
        'aspect-square size-full bg-secondary object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10',
        shape === 'tile' ? 'rounded-xl' : 'rounded-full',
      )}
    />
  )

  if (shape === 'circle') {
    return (
      <span className={cn('block size-8 shrink-0', className)}>{picture}</span>
    )
  }

  // 12px image radius + 6px plate padding = 18px outer radius.
  return (
    <span
      className={cn(
        'block size-14 shrink-0 rounded-[1.125rem] border border-transparent bg-card p-1.5 shadow-[0_0_0_1px_oklch(0_0_0/0.06),0_1px_2px_oklch(0_0_0/0.06)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08)]',
        className,
      )}
    >
      {picture}
    </span>
  )
}

/** Avatar + name. The one place player identity is rendered. */
export function PlayerChip({
  username,
  image,
  size = 'md',
  className,
  muted,
}: {
  username: string
  image?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
  muted?: boolean
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <PlayerAvatar
        username={username}
        image={image}
        className={size === 'lg' ? 'size-14' : size === 'sm' ? 'size-6' : ''}
      />
      <span
        className={cn(
          'min-w-0 truncate font-medium',
          size === 'lg' ? 'text-sm' : 'text-[0.82rem]',
          muted ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {username}
      </span>
    </span>
  )
}
