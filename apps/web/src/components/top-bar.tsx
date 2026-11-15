import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Bell, ShieldCheck, UserRound } from '#/components/icons'
import { SoundToggle } from '#/components/sound-toggle'
import { ThemeToggle } from '#/components/theme-toggle'
import { Button } from '#/components/ui/button'
import { useAdmin } from '#/lib/use-admin'
import { cn } from '#/lib/utils'
import { getUnreadCountFn } from '#/server/inbox.functions'

export function TopBar() {
  const auth = useAdmin()

  return (
    <header className="mx-auto grid w-full max-w-[27rem] shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-background px-3 py-2.5">
      <div className="flex items-center gap-0.5">
        <ThemeToggle />
        <SoundToggle />
      </div>

      <Link to="/" aria-label="Misri home">
        <span className="display text-xl">Misri</span>
      </Link>

      <div className="flex items-center justify-end gap-0.5">
        {auth.user && <InboxBell />}
        {auth.user ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn('rounded-full', auth.isAdmin && 'text-primary')}
          >
            <Link to="/account" data-tip="Your account">
              {auth.isAdmin ? <ShieldCheck /> : <UserRound />}
              <span className="max-w-[6rem] truncate">
                {auth.user.name.split(' ')[0]}
              </span>
            </Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link to="/auth/signin" aria-label="Sign in" data-tip="Sign in">
              <UserRound className="size-[1.15rem]" />
            </Link>
          </Button>
        )}
      </div>
    </header>
  )
}

/** The inbox, with how many are unread; checked on focus and every minute. */
function InboxBell() {
  const getUnread = useServerFn(getUnreadCountFn)
  const unread = useQuery({
    queryKey: ['unread'],
    queryFn: () => getUnread(),
    refetchInterval: 60_000,
  })
  const count = unread.data ?? 0
  const label = count > 0 ? `Inbox, ${count} unread` : 'Inbox'
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative rounded-full"
    >
      <Link to="/inbox" aria-label={label} data-tip={label}>
        <Bell className="size-[1.15rem]" />
        {count > 0 && (
          <span className="numeric absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Link>
    </Button>
  )
}
