import { createFileRoute, Link } from '@tanstack/react-router'
import {
  CompetitionCard,
  OpenCompetitions,
  StartButtons,
} from '#/components/competitions'
import { InstallCard } from '#/components/install-card'
import { HomeSkeleton } from '#/components/skeletons.tsx'
import { seo } from '#/lib/seo'
import { useAdmin } from '#/lib/use-admin'
import {
  getMyCompetitionsFn,
  getOpenCompetitionsFn,
} from '#/server/competitions.functions'

/** Home: signed-out visitors are sent to sign in by the `_authed` layout. */
export const Route = createFileRoute('/_authed/')({
  pendingComponent: HomeSkeleton,
  head: () =>
    seo({
      title: 'Your competitions',
      description: 'Your chess leagues and tournaments.',
      path: '/',
    }),
  loader: async () => {
    const [mine, open] = await Promise.all([
      getMyCompetitionsFn(),
      getOpenCompetitionsFn(),
    ])
    return { mine, open }
  },
  component: Home,
})

function Home() {
  const { mine, open } = Route.useLoaderData()
  const { user } = useAdmin()
  return (
    <div className="space-y-6 pt-2">
      <InstallCard />
      {user && !user.chessUsername && (
        <Link
          to="/account"
          className="block rounded-2xl bg-card px-4 py-3 text-sm shadow-card transition-colors duration-150 hover:bg-secondary"
        >
          <span className="font-semibold">Play on chess.com?</span>{' '}
          <span className="text-muted-foreground">
            Link your account to join chess.com competitions and analyse your
            games.
          </span>
        </Link>
      )}
      <header className="text-center">
        <h1 className="display text-3xl">Your competitions</h1>
      </header>

      <StartButtons />

      <section className="space-y-3" aria-label="Your competitions">
        {mine.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
            You're not in any competitions yet. Create one or join with a code.
          </p>
        ) : (
          mine.map((competition) => (
            <CompetitionCard key={competition.slug} competition={competition} />
          ))
        )}
      </section>

      <OpenCompetitions competitions={open} />
    </div>
  )
}
