import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronRight, ExternalLink } from '#/components/icons'
import { TrainHeader } from '#/components/train-header'
import { Input } from '#/components/ui/input'
import type { OpeningCourse } from '#/lib/openings'
import { lichessOpeningUrl, OPENINGS, parseOpenings } from '#/lib/openings'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/train/openings/')({
  head: () =>
    seo({
      title: 'Chess openings',
      description:
        'Learn the Italian, Ruy Lopez, Queen’s Gambit, Sicilian, French, Caro-Kann, London and more: every move explained, then drilled from memory.',
      path: '/train/openings',
    }),
  component: OpeningsScreen,
})

function OpeningsScreen() {
  return (
    <div className="space-y-5 pt-2">
      <TrainHeader title="Openings" />
      <p className="text-sm text-muted-foreground">
        Learn why each move is played, then drill the line from memory until it
        sticks.
      </p>
      <CourseList title="Play as White" side="white" />
      <CourseList title="Play as Black" side="black" />
      <Browse />
    </div>
  )
}

function CourseList({
  title,
  side,
}: {
  title: string
  side: OpeningCourse['side']
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="space-y-2">
        {OPENINGS.filter((course) => course.side === side).map((course) => (
          <li key={course.slug}>
            <Link
              to="/train/openings/$slug"
              params={{ slug: course.slug }}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-card transition-colors duration-150 hover:bg-secondary"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {course.name.split(':')[0]}
                  </span>
                  <span className="numeric text-xs text-muted-foreground">
                    {course.eco}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {course.summary}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Every opening Lichess names, searchable, each linking to its Lichess page. */
function Browse() {
  const [query, setQuery] = useState('')
  const { data: lines } = useQuery({
    queryKey: ['openings-dataset'],
    queryFn: async () =>
      parseOpenings(await (await fetch('/openings.tsv')).text()),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: query.trim().length > 1,
  })

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches =
    lines && words.length
      ? lines
          .filter((line) =>
            words.every((word) => line.name.toLowerCase().includes(word)),
          )
          .slice(0, 25)
      : []

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Browse every opening</h2>
      <label htmlFor="opening-search" className="sr-only">
        Search openings
      </label>
      <Input
        id="opening-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Sicilian Dragon"
        autoComplete="off"
      />
      <p className="text-xs text-muted-foreground">
        {words.length === 0 || !lines
          ? 'All 3,800+ named openings from the Lichess database.'
          : `${matches.length === 25 ? 'First 25' : matches.length} result${matches.length === 1 ? '' : 's'}`}
      </p>
      <ul className="divide-y divide-border/60">
        {matches.map((line) => (
          <li key={`${line.eco}${line.moves.join(' ')}`} className="py-2">
            <a
              href={lichessOpeningUrl(line.name)}
              target="_blank"
              rel="noreferrer noopener"
              className="group block"
            >
              <span className="flex items-baseline justify-between gap-2 text-sm font-medium group-hover:text-primary">
                {line.name}
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  {line.eco}
                  <ExternalLink className="size-3" />
                </span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {line.moves.join(' ')}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
