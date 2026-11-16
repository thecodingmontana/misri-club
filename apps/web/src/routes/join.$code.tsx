import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import {
  FORMAT_INFO,
  FORMAT_LABEL,
  FormatExplainer,
  JoinButton,
  STATUS_LABEL,
} from '#/components/competitions'
import { Trophy } from '#/components/icons'
import { scoringSummary } from '#/components/scoring-rules'
import { Button } from '#/components/ui/button'
import { seo } from '#/lib/seo'
import { useAdmin } from '#/lib/use-admin'
import { getInviteFn } from '#/server/competitions.functions'

/** An invite link: shows what you're joining; signed-out visitors sign in first. */
export const Route = createFileRoute('/join/$code')({
  loader: async ({ params }) => {
    const invite = await getInviteFn({ data: { code: params.code } })
    if (!invite) throw notFound()
    return invite
  },
  head: ({ loaderData }) =>
    seo({
      title: loaderData ? `Join ${loaderData.name}` : 'Join',
      description: 'You have been invited to a chess competition on Misri.',
      noindex: true,
    }),
  component: Invite,
})

function Invite() {
  const invite = Route.useLoaderData()
  const { code } = Route.useParams()
  const { user } = useAdmin()
  const here = `/join/${code}`
  const players = invite.maxPlayers
    ? `${invite.members} of ${invite.maxPlayers}`
    : String(invite.members)
  const facts: Array<[string, string]> = [
    ['Organiser', invite.organiser],
    [
      'Format',
      invite.format === 'league' && invite.legs === 2
        ? 'League, home & away'
        : FORMAT_LABEL[invite.format],
    ],
    ['Players', players],
    ['Status', STATUS_LABEL[invite.status]],
    [
      'Time to play',
      `${invite.matchdayDays} day${invite.matchdayDays === 1 ? '' : 's'} per round`,
    ],
    [
      'Joining',
      invite.requireApproval
        ? 'The organiser approves each player'
        : 'Straight in',
    ],
  ]

  return (
    <div className="space-y-5 pt-6">
      <section className="space-y-5 rounded-2xl bg-card px-4 py-6 shadow-card">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Trophy className="size-7" />
          </span>
          <p className="kicker">
            {invite.isMember ? "You're in" : "You're invited to"}
          </p>
          <h1 className="display text-2xl">{invite.name}</h1>
          <p className="text-sm text-muted-foreground">
            {FORMAT_INFO[invite.format].summary}
          </p>
        </div>

        <dl className="divide-y divide-border rounded-xl bg-background px-3 text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {scoringSummary(invite.format, invite.unplayedRule, invite.points)}
        </p>

        {invite.isMember ? (
          <Button asChild size="lg" className="w-full rounded-xl">
            <Link to="/c/$slug" params={{ slug: invite.slug }}>
              Open the competition
            </Link>
          </Button>
        ) : invite.requested ? (
          <p className="rounded-xl bg-background px-3 py-3 text-center text-sm text-muted-foreground">
            Request sent. Waiting for the organiser.
          </p>
        ) : !invite.canJoin ? (
          <>
            <p className="text-center text-sm text-muted-foreground">
              {invite.reason}
            </p>
            <Button asChild variant="secondary" className="w-full rounded-xl">
              <Link to="/c/$slug" params={{ slug: invite.slug }}>
                See the competition
              </Link>
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            {!user ? (
              <Button asChild size="lg" className="w-full rounded-xl sm:flex-1">
                <Link to="/auth/signin" search={{ redirect: here }}>
                  Sign in to join
                </Link>
              </Button>
            ) : !user.chessUsername ? (
              <Button asChild size="lg" className="w-full rounded-xl sm:flex-1">
                <Link to="/onboarding" search={{ redirect: here }}>
                  Link your chess.com account to join
                </Link>
              </Button>
            ) : (
              <div className="sm:flex-1">
                <JoinButton
                  code={code}
                  label={invite.requireApproval ? 'Ask to join' : 'Join'}
                  size="lg"
                />
              </div>
            )}
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="w-full rounded-xl sm:flex-1"
            >
              <Link to={user ? '/' : '/welcome'}>Decline</Link>
            </Button>
          </div>
        )}
      </section>
      <FormatExplainer format={invite.format} />
    </div>
  )
}
