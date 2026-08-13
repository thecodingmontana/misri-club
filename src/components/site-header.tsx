import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { ExternalLink, LogOut, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { logoutFn } from '#/server/auth.functions'
import { useAdmin } from '#/lib/use-admin'
import { cn } from '#/lib/utils'

const NAV = [
  { to: '/', label: 'Leaderboard' },
  { to: '/fixtures', label: 'Fixtures' },
  { to: '/all-time', label: 'All-time' },
] as const

export function SiteHeader() {
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

  return (
    <header className="brass-edge sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-md border border-brass/35 bg-gradient-to-b from-brass/25 to-transparent text-lg text-brass"
          >
            ♞
          </span>
          <span className="leading-none">
            <span className="display block text-lg font-semibold tracking-tight">
              Misri
            </span>
            <span className="block text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Chess Club League
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === '/' }}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
                'hover:bg-accent hover:text-foreground',
              )}
              activeProps={{ className: 'bg-accent text-brass' }}
            >
              {item.label}
            </Link>
          ))}

          <a
            href="https://www.chess.com/club/misri"
            target="_blank"
            rel="noreferrer noopener"
            className="ml-2 hidden items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brass/50 hover:text-brass sm:flex"
          >
            chess.com
            <ExternalLink className="size-3.5" />
          </a>

          {auth.isAdmin ? (
            <button
              type="button"
              onClick={() => signOut.mutate()}
              disabled={signOut.isPending}
              title="Sign out of admin"
              className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-brass/35 bg-brass/10 px-3 py-2 text-sm font-medium text-brass transition-colors hover:bg-brass/20"
            >
              <ShieldCheck className="size-3.5" />
              <span className="hidden sm:inline">Admin</span>
              <LogOut className="size-3.5 opacity-70" />
            </button>
          ) : (
            <Link
              to="/login"
              className="ml-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: 'bg-accent text-brass' }}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
