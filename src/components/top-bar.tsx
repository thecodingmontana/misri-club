import { useMutation } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { toast } from 'sonner'
import { LogOut, RefreshCw, ShieldCheck, UserRound } from '#/components/icons'
import { ThemeToggle } from '#/components/theme-toggle'
import { Button } from '#/components/ui/button'
import { useSyncNow } from '#/lib/queries'
import { useAdmin } from '#/lib/use-admin'
import { cn } from '#/lib/utils'
import { logoutFn } from '#/server/auth.functions'

export function TopBar() {
  const auth = useAdmin()
  const router = useRouter()
  const logout = useServerFn(logoutFn)

  const signOut = useMutation({
    mutationFn: () => logout(),
    onSuccess: async () => {
      await router.invalidate()
      toast.success('Signed out')
    },
  })

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
      </div>

      <Link to="/" aria-label="Misri home">
        <span className="display text-xl">Misri</span>
      </Link>

      <div className="flex justify-end">
        {auth.isAdmin ? (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-primary"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
            title="Sign out of admin"
          >
            <ShieldCheck />
            Admin
            <LogOut className="opacity-70" />
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link to="/login" aria-label="Admin sign in" title="Admin sign in">
              <UserRound className="size-[1.15rem]" />
            </Link>
          </Button>
        )}
      </div>
    </header>
  )
}
