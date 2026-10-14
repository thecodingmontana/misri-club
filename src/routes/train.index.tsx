import { createFileRoute, Link } from '@tanstack/react-router'
import { Book, ChevronRight, Cpu, Lightbulb, Trophy } from '#/components/icons'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/train/')({
  head: () =>
    seo({
      title: 'Train',
      description:
        'Free chess training: endless tactics puzzles, games against Stockfish and famous master games to study, right in your browser.',
      path: '/train',
    }),
  component: TrainScreen,
})

const MODES = [
  {
    to: '/train/puzzles',
    icon: Lightbulb,
    title: 'Puzzles',
    description: 'Endless tactics from Lichess. Find the best move.',
  },
  {
    to: '/train/play',
    icon: Cpu,
    title: 'Play Stockfish',
    description: 'A full game against the engine, from Beginner to Max.',
  },
  {
    to: '/train/openings',
    icon: Book,
    title: 'Openings',
    description:
      'Learn the Italian, Queen’s Gambit, Sicilian and more, then drill them.',
  },
  {
    to: '/train/masters',
    icon: Trophy,
    title: 'Master games',
    description:
      'Replay famous games, learn the key moves, guess them yourself.',
  },
] as const

/** Practice away from the league: pick how to train, then go. */
function TrainScreen() {
  return (
    <div className="space-y-5 pt-2">
      <header className="text-center">
        <p className="kicker">Practice</p>
        <h1 className="display mt-1 text-3xl">Train</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          How do you want to train today?
        </p>
      </header>

      <nav className="space-y-3" aria-label="Training modes">
        {MODES.map((mode) => (
          <Link
            key={mode.to}
            to={mode.to}
            className="flex items-center gap-4 rounded-2xl bg-card px-4 py-4 shadow-card transition-colors duration-150 hover:bg-secondary"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
              <mode.icon className="size-6" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{mode.title}</span>
              <span className="block text-xs text-muted-foreground">
                {mode.description}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </nav>
    </div>
  )
}
