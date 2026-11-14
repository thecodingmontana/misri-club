import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { FORMAT_LABEL, JoinButton } from '#/components/competitions'
import { Trophy } from '#/components/icons'
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

  return (
    <div className="space-y-5 pt-6">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-4 py-6 text-center shadow-card">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
          <Trophy className="size-7" />
        </span>
        <p className="kicker">You're invited to</p>
        <h1 className="display text-2xl">{invite.name}</h1>
        <p className="numeric text-xs text-muted-foreground">
          {FORMAT_LABEL[invite.format]} · {invite.members} player
          {invite.members === 1 ? '' : 's'}
        </p>

        {!invite.canJoin ? (
          <>
            <p className="text-sm text-muted-foreground">{invite.reason}</p>
            <Button asChild variant="secondary" className="w-full rounded-xl">
              <Link to="/c/$slug" params={{ slug: invite.slug }}>
                See the competition
              </Link>
            </Button>
          </>
        ) : !user ? (
          <Button asChild size="lg" className="w-full rounded-xl">
            <Link to="/auth/signin" search={{ redirect: here }}>
              Sign in to join
            </Link>
          </Button>
        ) : !user.chessUsername ? (
          <Button asChild size="lg" className="w-full rounded-xl">
            <Link to="/onboarding" search={{ redirect: here }}>
              Link your chess.com account to join
            </Link>
          </Button>
        ) : (
          <JoinButton code={code} label="Join" size="lg" />
        )}
      </div>
    </div>
  )
}
