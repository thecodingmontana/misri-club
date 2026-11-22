import { createFileRoute, Link } from '@tanstack/react-router'
import {
  CHOICES,
  CompetitionCard,
  OpenCompetitions,
} from '#/components/competitions'
import { Plus, UserPlus } from '#/components/icons'
import { InstallCard } from '#/components/install-card'
import { Button } from '#/components/ui/button'
import { seo } from '#/lib/seo'
import { useAdmin } from '#/lib/use-admin'
import {
  getMyCompetitionsFn,
  getOpenCompetitionsFn,
} from '#/server/competitions.functions'

/** Home: signed-out visitors are sent to sign in by the `_authed` layout. */
export const Route = createFileRoute('/_authed/')({
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

      <div className="grid gap-2 sm:grid-cols-3">
        {CHOICES.map((choice) => (
          <Button
            key={choice.title}
            asChild
            variant="secondary"
            className="h-auto justify-start py-3 sm:flex-col sm:justify-center"
          >
            <Link to={choice.to} search={choice.search}>
              <Plus className="size-5 text-primary" />
              {choice.title}
            </Link>
          </Button>
        ))}
        <Button
          asChild
          variant="secondary"
          className="h-auto justify-start py-3 sm:flex-col sm:justify-center"
        >
          <Link to="/join">
            <UserPlus className="size-5 text-primary" />
            Join with a code
          </Link>
        </Button>
      </div>

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
