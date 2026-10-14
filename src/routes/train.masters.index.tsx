import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronRight } from '#/components/icons'
import { TrainHeader } from '#/components/train-header'
import type { Tag } from '#/lib/masters'
import { MASTER_GAMES } from '#/lib/masters'
import { seo } from '#/lib/seo'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/train/masters/')({
  head: () =>
    seo({
      title: 'Master games',
      description:
        'Replay the most famous chess games ever played, from the Immortal Game to Kasparov’s Immortal, with notes on every key moment and Stockfish analysis.',
      path: '/train/masters',
    }),
  component: MastersScreen,
})

const TAGS: Array<Tag> = [
  'sacrifice',
  'queen sacrifice',
  'king hunt',
  'attack',
  'miniature',
]

/** The library: pick a famous game to replay, study or guess along with. */
function MastersScreen() {
  const [tag, setTag] = useState<Tag | null>(null)
  const games = tag
    ? MASTER_GAMES.filter((game) => game.tags.includes(tag))
    : MASTER_GAMES

  return (
    <div className="space-y-4 pt-2">
      <TrainHeader title="Master games" />
      <p className="text-sm text-muted-foreground">
        Replay iconic games move by move, see why the key moves work, then try
        to guess them yourself.
      </p>

      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Filter by theme</legend>
        {[null, ...TAGS].map((option) => (
          <button
            key={option ?? 'all'}
            type="button"
            data-cuelume-select=""
            aria-pressed={tag === option}
            onClick={() => setTag(option)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors duration-150',
              tag === option
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            {option ?? 'All'}
          </button>
        ))}
      </fieldset>

      <ul className="space-y-3">
        {games.map((game) => (
          <li key={game.slug}>
            <Link
              to="/train/masters/$slug"
              params={{ slug: game.slug }}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-card transition-colors duration-150 hover:bg-secondary"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{game.title}</span>
                  <span className="numeric text-xs text-muted-foreground">
                    {game.year}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {game.white} vs {game.black}
                </span>
                <span className="mt-1 block text-xs leading-relaxed">
                  {game.description}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {game.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-medium text-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
