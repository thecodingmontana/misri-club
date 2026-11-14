import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserRound,
} from '#/components/icons'
import { MAIN_NAV } from '#/components/nav'
import { PlayerAvatar } from '#/components/player-chip'
import { useAdmin } from '#/lib/use-admin'
import { cn } from '#/lib/utils'

const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * The desktop sidebar (from `md` up), like Zadaci's: the same items as the
 * phone tab bar, collapsible to an icon rail. The choice is kept in a cookie
 * the server reads, so a collapsed sidebar never flashes open on reload.
 */
export function AppSidebar({ open }: { open: boolean }) {
  const [expanded, setExpanded] = useState(open)
  const auth = useAdmin()

  function toggle() {
    const next = !expanded
    setExpanded(next)
    // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie the server reads on the next load
    document.cookie = `sidebar_state=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`
  }

  const itemClass = cn(
    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground data-[status=active]:bg-primary/12 data-[status=active]:font-semibold data-[status=active]:text-primary',
    !expanded && 'justify-center px-0',
  )

  return (
    <aside
      aria-label="Main"
      className={cn(
        'hidden shrink-0 flex-col border-r border-border bg-sidebar py-3 transition-[width] duration-200 md:flex',
        expanded ? 'w-56 px-3' : 'w-16 px-2',
      )}
    >
      <div
        className={cn(
          'mb-4 flex items-center',
          expanded ? 'justify-between pl-3' : 'justify-center',
        )}
      >
        {expanded && (
          <Link to="/" className="display text-xl" aria-label="Misri home">
            Misri
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          data-tip={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          data-tip-pos="right"
          aria-expanded={expanded}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {expanded ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {MAIN_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: 'exact' in item }}
            title={expanded ? undefined : item.label}
            className={itemClass}
          >
            <item.icon className="size-5 shrink-0 group-data-[status=active]:hidden" />
            <item.active className="hidden size-5 shrink-0 group-data-[status=active]:block" />
            {expanded && item.label}
          </Link>
        ))}
      </nav>

      {auth.user ? (
        <Link
          to="/account"
          title={expanded ? undefined : 'Your account'}
          className={itemClass}
        >
          <PlayerAvatar
            username={auth.user.name}
            image={auth.user.chessAvatar || auth.user.image}
            className="size-6"
          />
          {expanded && (
            <span className="min-w-0 flex-1 truncate">{auth.user.name}</span>
          )}
          {expanded && auth.isAdmin && (
            <ShieldCheck className="size-4 text-primary" aria-label="Admin" />
          )}
        </Link>
      ) : (
        <Link
          to="/auth/signin"
          title={expanded ? undefined : 'Sign in'}
          className={itemClass}
        >
          <UserRound className="size-5 shrink-0" />
          {expanded && 'Sign in'}
        </Link>
      )}
    </aside>
  )
}
