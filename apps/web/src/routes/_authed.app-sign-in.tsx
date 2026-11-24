import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { z } from 'zod'
import { AuthShell, Spinner } from '#/components/auth'
import { Button } from '#/components/ui/button'
import { seo } from '#/lib/seo'
import { toast } from '#/lib/toast'
import { appChallenge, issueAppCodeFn } from '#/server/app-sign-in.functions'

/** The Misri app sends players here to sign in; they confirm, and go back to it. */
export const Route = createFileRoute('/_authed/app-sign-in')({
  validateSearch: z.object({ challenge: appChallenge.catch('') }),
  head: () =>
    seo({
      title: 'Sign in to the app',
      description: 'Use your Misri account in the Misri app.',
      noindex: true,
    }),
  component: AppSignIn,
})

function AppSignIn() {
  const { challenge } = Route.useSearch()
  const { user } = Route.useRouteContext()
  const issue = useServerFn(issueAppCodeFn)
  const [busy, setBusy] = useState(false)

  if (!challenge) {
    return (
      <AuthShell
        title="Open this from the app"
        description="This link only works when the Misri app opens it. Start signing in from the app."
      >
        {null}
      </AuthShell>
    )
  }

  async function allow() {
    setBusy(true)
    try {
      const code = await issue({ data: { challenge } })
      window.location.href = `misri://auth?code=${encodeURIComponent(code)}`
    } catch (error) {
      toast.error("Couldn't sign in to the app", {
        desc: (error as Error).message,
      })
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Sign in to the Misri app?"
      description={`The app will use your account, ${user.name}. Only continue if you just started this in the app.`}
    >
      <div className="space-y-2">
        <Button className="w-full" disabled={busy} onClick={allow}>
          {busy && <Spinner />}
          Continue to the app
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            window.location.href = 'misri://auth?cancelled=1'
          }}
        >
          Cancel
        </Button>
      </div>
    </AuthShell>
  )
}
