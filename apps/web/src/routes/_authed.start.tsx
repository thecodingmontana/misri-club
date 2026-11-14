import { createFileRoute } from '@tanstack/react-router'
import { OpenCompetitions, StartChoices } from '#/components/competitions'
import { InstallCard } from '#/components/install-card'
import { seo } from '#/lib/seo'
import { getOpenCompetitionsFn } from '#/server/competitions.functions'

/** Where onboarding lands: start something, or join something. */
export const Route = createFileRoute('/_authed/start')({
  head: () =>
    seo({
      title: 'Get started',
      description: 'Create a league or tournament, or join one.',
      noindex: true,
    }),
  loader: () => getOpenCompetitionsFn(),
  component: Start,
})

function Start() {
  const open = Route.useLoaderData()
  return (
    <div className="space-y-6 pt-2">
      <header className="text-center">
        <h1 className="display text-3xl">What's next?</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Start your own competition or join one.
        </p>
      </header>
      <StartChoices />
      <InstallCard />
      <OpenCompetitions competitions={open} />
    </div>
  )
}
