import { createFileRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/train')({
  component: TrainLayout,
})

const MODES = [{ to: '/train', label: 'Puzzles', exact: true }] as const

/** Practice away from the league: puzzles, or a game against the engine. */
function TrainLayout() {
  return (
    <div className="space-y-4 pt-2">
      <header className="text-center">
        <p className="kicker">Practice</p>
        <h1 className="display mt-1 text-3xl">Train</h1>
      </header>

      <nav
        className="flex gap-1 rounded-full bg-secondary p-1"
        aria-label="Training mode"
      >
        {MODES.map((mode) => (
          <Link
            key={mode.to}
            to={mode.to}
            activeOptions={{ exact: mode.exact }}
            className="flex-1 rounded-full px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground data-[status=active]:bg-background data-[status=active]:text-foreground data-[status=active]:shadow-card"
          >
            {mode.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
