import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { AuthShell } from '#/components/auth'
import { Button } from '#/components/ui/button'
import { seo } from '#/lib/seo'
import { getSignInLinkEmailFn } from '#/server/auth.functions'

// A sign-in link opened from an email app lands here first: it says whose
// account it signs into, so nobody can slip you a link to theirs.
export const Route = createFileRoute('/auth/confirm-sign-in')({
  validateSearch: z.object({
    token: z.string().max(200).catch(''),
    callbackURL: z.string().max(500).optional(),
    newUserCallbackURL: z.string().max(500).optional(),
    errorCallbackURL: z.string().max(500).optional(),
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => ({
    email: await getSignInLinkEmailFn({ data: deps.token }),
  }),
  head: () =>
    seo({
      title: 'Confirm sign-in',
      description: 'Check whose account this link signs into.',
      noindex: true,
    }),
  component: ConfirmSignIn,
})

function ConfirmSignIn() {
  const search = Route.useSearch()
  const { email } = Route.useLoaderData()

  if (!email) {
    return (
      <AuthShell
        title="This sign-in link has expired"
        description="Links work once and for 10 minutes. Ask for a new one."
      >
        <Button asChild size="lg">
          <Link to="/auth/signin">Back to sign in</Link>
        </Button>
      </AuthShell>
    )
  }

  // Continuing from this page is a same-origin request, which signs in.
  const verify = `/api/auth/magic-link/verify?${new URLSearchParams(
    Object.entries(search).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  )}`

  return (
    <AuthShell
      title="Sign in to Misri?"
      description="Check it's your email. If you didn't ask for this link, close this page."
    >
      <p className="rounded-xl border px-3 py-2 text-sm">
        You&apos;re signing in as <b>{email}</b>
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="lg" className="flex-1">
          <Link to="/auth/signin">Not me</Link>
        </Button>
        <Button asChild size="lg" className="flex-1">
          <a href={verify}>Continue</a>
        </Button>
      </div>
    </AuthShell>
  )
}
