import { createFileRoute, Link } from '@tanstack/react-router'
import type { ComponentType, SVGProps } from 'react'
import { FORMAT_INFO, FORMAT_LABEL } from '#/components/competitions'
import {
  Clock,
  CrownOutline,
  RefreshCw,
  UserPlusOutline,
} from '#/components/icons'
import { MatchCard } from '#/components/match-card'
import { ThemeToggle } from '#/components/theme-toggle'
import { Button } from '#/components/ui/button'
import { HOME_DESCRIPTION, seo } from '#/lib/seo'
import { useAdmin } from '#/lib/use-admin'

/** What visitors see first: what Misri does, in its own words, and a way in. */
export const Route = createFileRoute('/welcome')({
  head: () =>
    seo({
      title: 'Chess leagues and tournaments on chess.com',
      description: HOME_DESCRIPTION,
      path: '/welcome',
    }),
  component: Welcome,
})

// The example card's players are placeholders, labelled as an example.
const EXAMPLE = {
  you: { id: 'you', name: 'You', image: null, chessUsername: null },
  friend: { id: 'friend', name: 'A friend', image: null, chessUsername: null },
}

const ORGANISER: Array<{
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  body: string
}> = [
  {
    icon: RefreshCw,
    title: 'Results come in by themselves',
    body: 'Play your match on chess.com. Misri finds the game and updates the table.',
  },
  {
    icon: CrownOutline,
    title: 'Your rules',
    body: 'Choose the points, what happens to unplayed matches, and what happens when someone leaves.',
  },
  {
    icon: UserPlusOutline,
    title: 'Your players',
    body: 'Invite with a code, cap the numbers, approve each player or let anyone in.',
  },
  {
    icon: Clock,
    title: 'Nobody forgets',
    body: 'Players get a push notification when a match is close to its deadline.',
  },
]

function Welcome() {
  const { user } = useAdmin()

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <span className="display text-2xl">Misri</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {!user && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth/signin">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-14 px-4 pb-12">
        {/* the focal point: what it is, and the one thing to do */}
        <section className="space-y-5 pt-6">
          <h1 className="display text-4xl leading-tight text-balance sm:text-5xl">
            Your chess league, run for you on chess.com.
          </h1>
          <p className="max-w-prose text-pretty text-muted-foreground">
            Create a league or a knockout, invite friends with a code, and play
            your matches on chess.com. Misri keeps the fixtures, the results and
            the table.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-xl">
              {user ? (
                <Link to="/">Open Misri</Link>
              ) : (
                <Link
                  to="/auth/signin"
                  search={{ redirect: '/competitions/new?format=league' }}
                >
                  Start a league
                </Link>
              )}
            </Button>
            <Link
              to="/join"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              I have an invite code
            </Link>
          </div>
          <div className="pt-2">
            <MatchCard
              label={<span className="kicker">Example fixture</span>}
              home={EXAMPLE.you}
              away={EXAMPLE.friend}
              score={null}
              winner={null}
              tone="live"
              status="1d 4h left"
            />
          </div>
        </section>

        <section className="space-y-5" aria-labelledby="organiser-heading">
          <h2 id="organiser-heading" className="display text-2xl text-balance">
            You set the rules. Misri keeps the score.
          </h2>
          <ul className="space-y-4">
            {ORGANISER.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <Icon
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-hidden
                />
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4" aria-labelledby="formats-heading">
          <h2 id="formats-heading" className="display text-2xl">
            Two ways to play
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['league', 'knockout'] as const).map((format) => (
              <div
                key={format}
                className="space-y-2 rounded-2xl bg-card p-4 shadow-card"
              >
                <p className="font-semibold">{FORMAT_LABEL[format]}</p>
                <p className="text-sm text-muted-foreground">
                  {FORMAT_INFO[format].summary}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {FORMAT_INFO[format].points.slice(0, 3).map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-card">
          <p className="font-semibold">Between rounds</p>
          <p className="text-sm text-muted-foreground">
            Puzzles, opening drills, famous master games and practice against
            Stockfish, free and without signing in.
          </p>
          <Link
            to="/train"
            className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Go to training
          </Link>
        </section>
      </main>

      <footer className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-5 text-xs text-muted-foreground">
        <Link to="/terms" className="hover:text-foreground">
          Terms
        </Link>
        <Link to="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <span>Misri isn't made by or connected to chess.com.</span>
      </footer>
    </div>
  )
}
