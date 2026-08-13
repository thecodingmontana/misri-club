import { Link } from '@tanstack/react-router'
import { CalendarDays, Home, Trophy, Users } from 'lucide-react'
import { cn } from '#/lib/utils'

const TABS = [
  { to: '/', label: 'Home', icon: Home, exact: true },
  { to: '/table', label: 'Table', icon: Trophy, exact: false },
  { to: '/fixtures', label: 'Fixtures', icon: CalendarDays, exact: false },
  { to: '/club', label: 'Club', icon: Users, exact: false },
] as const

/**
 * Floating tab bar pinned to the bottom of the phone-width column, the way the
 * reference designs do it.
 */
export function BottomNav() {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/70 bg-card/95 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: tab.exact }}
            aria-label={tab.label}
            className={cn(
              'flex min-w-[3.75rem] flex-col items-center gap-0.5 rounded-full px-3 py-2',
              'text-[0.62rem] font-medium text-muted-foreground transition-colors',
              'hover:text-foreground',
            )}
            activeProps={{ className: 'bg-brass/15 text-brass' }}
          >
            <tab.icon className="size-[1.15rem]" />
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
