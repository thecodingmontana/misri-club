import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { LogOut, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { logoutFn } from '#/server/auth.functions'
import { syncNowFn } from '#/server/league.functions'
import { useAdmin } from '#/lib/use-admin'
import { cn } from '#/lib/utils'

export function TopBar() {
  const auth = useAdmin()
  const router = useRouter()
  const logout = useServerFn(logoutFn)
  const sync = useServerFn(syncNowFn)

  const signOut = useMutation({
    mutationFn: () => logout(),
    onSuccess: async () => {
      await router.invalidate()
      toast.success('Signed out')
    },
  })

  // Lives here rather than on a single screen so it is reachable from anywhere,
  // including an empty database where no matchday card exists yet.
  const syncNow = useMutation({
    mutationFn: () => sync(),
    onSuccess: async (result) => {
      await router.invalidate()
      toast.success(
        result.gamesAdded === 0
          ? 'No new games'
          : `${result.gamesAdded} new game${result.gamesAdded === 1 ? '' : 's'}`,
        {
          description: result.errors.length
            ? `${result.errors.length} endpoint(s) failed.`
            : `${result.playersScanned} members · ${result.gamesLinked} counted`,
        },
      )
    },
    onError: (error: Error) =>
      toast.error('Sync failed', { description: error.message }),
  })

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md">
      <Link to="/" className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-xl border border-brass/35 bg-gradient-to-b from-brass/25 to-transparent text-lg text-brass"
        >
          ♞
        </span>
        <span className="leading-tight">
          <span className="display block text-base font-semibold">Misri</span>
          <span className="block text-[0.6rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Chess League
          </span>
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => syncNow.mutate()}
          disabled={syncNow.isPending}
          title="Pull the latest games from chess.com"
          aria-label="Sync with chess.com"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brass/40 hover:text-brass disabled:opacity-60"
        >
          <RefreshCw
            className={cn('size-3.5', syncNow.isPending && 'animate-spin')}
          />
          <span className="sr-only sm:not-sr-only">Sync</span>
        </button>

        {auth.isAdmin ? (
          <button
            type="button"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
            title="Sign out of admin"
            className="inline-flex items-center gap-1.5 rounded-full border border-brass/35 bg-brass/10 px-3 py-1.5 text-xs font-medium text-brass transition-colors hover:bg-brass/20"
          >
            <ShieldCheck className="size-3.5" />
            Admin
            <LogOut className="size-3 opacity-70" />
          </button>
        ) : (
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brass/40 hover:text-brass"
          >
            <UserRound className="size-3.5" />
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
