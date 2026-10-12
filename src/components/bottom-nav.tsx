import { Link } from '@tanstack/react-router'
import { CalendarDays, Crown, Home, Users } from '#/components/icons'

const TABS = [
  { to: '/', label: 'Home', icon: Home, exact: true },
  { to: '/table', label: 'Table', icon: Crown, exact: false },
  { to: '/fixtures', label: 'Fixtures', icon: CalendarDays, exact: false },
  { to: '/club', label: 'Club', icon: Users, exact: false },
] as const

/** Tab bar along the bottom of the phone column; the active tab burns orange. */
export function BottomNav() {
  return (
    <nav className="shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid w-full max-w-[27rem] grid-cols-4">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: tab.exact }}
            className="flex flex-col items-center gap-1 py-3 text-[0.65rem] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: 'text-flame hover:text-flame' }}
          >
            <tab.icon className="size-5" />
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
