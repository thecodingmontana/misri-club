import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import {
  CompetitionCard,
  DISCOVER_FILTERS,
  DiscoverHeader,
  FORMAT_LABEL,
  JoinButton,
} from '#/components/competitions'
import { DiscoverSkeleton } from '#/components/skeletons.tsx'
import { Button } from '#/components/ui/button'
import { seo } from '#/lib/seo'
import { useAdmin } from '#/lib/use-admin'
import { getOpenCompetitionsFn } from '#/server/competitions.functions'

/** Every public competition taking players, for anyone to browse. */
export const Route = createFileRoute('/discover')({
  pendingComponent: DiscoverSkeleton,
  validateSearch: z.object({
    format: z.enum(DISCOVER_FILTERS).catch('all').default('all'),
  }),
  head: () =>
    seo({
      title: 'Open competitions',
      description:
        'Public chess leagues and tournaments on Misri that are taking players now.',
      path: '/discover',
    }),
  loader: () => getOpenCompetitionsFn(),
  component: Discover,
})

function Discover() {
  const all = Route.useLoaderData()
  const { format } = Route.useSearch()
  const { user } = useAdmin()
  const shown = format === 'all' ? all : all.filter((c) => c.format === format)

  return (
    <div className="space-y-5 pt-2">
      <DiscoverHeader format={format} />

      {shown.length === 0 ? (
        <div className="space-y-3 rounded-2xl bg-card px-4 py-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            {format === 'all'
              ? 'No public competitions are taking players right now.'
              : `No public ${format === 'groups' ? 'groups + knockout competitions' : `${FORMAT_LABEL[format].toLowerCase()}s`} are taking players right now.`}
          </p>
          <Button asChild variant="secondary" className="rounded-xl">
            <Link
              to="/competitions/new"
              search={{ format: format === 'all' ? 'league' : format }}
            >
              Start your own
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((competition) => (
            <li key={competition.slug}>
              <CompetitionCard
                competition={competition}
                action={
                  user ? (
                    <JoinButton slug={competition.slug} />
                  ) : (
                    <Button
                      asChild
                      size="sm"
                      variant="secondary"
                      className="rounded-full"
                    >
                      <Link
                        to="/auth/signin"
                        search={{ redirect: `/c/${competition.slug}` }}
                      >
                        Join
                      </Link>
                    </Button>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
