import { Link } from '@tanstack/react-router'
import { RefreshCw, ShieldCheck, UserRound } from '#/components/icons'
import { SoundToggle } from '#/components/sound-toggle'
import { ThemeToggle } from '#/components/theme-toggle'
import { Button } from '#/components/ui/button'
import { useSyncNow } from '#/lib/queries'
import { useAdmin } from '#/lib/use-admin'
import { cn } from '#/lib/utils'

export function TopBar() {
  const auth = useAdmin()

  // Lives here rather than on a single screen so it is reachable from anywhere,
  // including an empty database where no matchday card exists yet.
  const syncNow = useSyncNow()

  return (
    <header className="mx-auto grid w-full max-w-[27rem] shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-background px-3 py-2.5">
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => syncNow.mutate()}
          disabled={syncNow.isPending}
          title="Pull the latest games from chess.com"
          aria-label="Sync with chess.com"
        >
          <RefreshCw
            className={cn(
              'size-[1.15rem]',
              syncNow.isPending && 'animate-spin',
            )}
          />
        </Button>
        <ThemeToggle />
        <SoundToggle />
      </div>

      <Link to="/" aria-label="Misri home">
        <span className="display text-xl">Misri</span>
      </Link>

      <div className="flex justify-end">
        {auth.user ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn('rounded-full', auth.isAdmin && 'text-primary')}
          >
            <Link to="/account" title="Your account">
              {auth.isAdmin ? <ShieldCheck /> : <UserRound />}
              <span className="max-w-[6rem] truncate">
                {auth.user.name.split(' ')[0]}
              </span>
            </Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link to="/auth/signin" aria-label="Sign in" title="Sign in">
              <UserRound className="size-[1.15rem]" />
            </Link>
          </Button>
        )}
      </div>
    </header>
  )
}
