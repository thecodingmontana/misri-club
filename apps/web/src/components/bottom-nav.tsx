import { Link } from '@tanstack/react-router'
import { MAIN_NAV } from '#/components/nav'

/**
 * Tab bar along the bottom of the phone column; the desktop sidebar takes over
 * from `md` up. The active tab swaps to a filled icon on a green pill and a
 * bolder label, so it reads at a glance without relying on colour alone.
 */
export function BottomNav() {
  return (
    <nav className="shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto grid w-full max-w-[27rem] grid-cols-5">
        {MAIN_NAV.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: 'exact' in tab }}
            // TanStack Link sets data-status="active" on the current tab.
            className="group flex flex-col items-center gap-1 py-2 text-[0.65rem] font-semibold text-muted-foreground transition-colors duration-150 [-webkit-tap-highlight-color:transparent] hover:text-foreground data-[status=active]:font-bold data-[status=active]:text-primary"
          >
            <span className="grid h-7 w-14 place-items-center rounded-full transition-colors duration-150 group-data-[status=active]:bg-primary/15">
              <tab.icon className="size-5 group-data-[status=active]:hidden" />
              <tab.active className="hidden size-5 group-data-[status=active]:block" />
            </span>
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
