import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { AuthShell, PasskeySignInButton, Spinner } from '#/components/auth'
import { GoogleLogo } from '#/components/google-logo'
import { Mail, MailOpen } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { authClient, rememberNext, safePath } from '#/lib/auth-client'
import { seo } from '#/lib/seo'
import { toast } from '#/lib/toast'
import { useAdmin } from '#/lib/use-admin'
import { getSessionFn } from '#/server/auth.functions'

export const Route = createFileRoute('/auth/signin')({
  validateSearch: z.object({
    error: z.string().optional(),
    redirect: z.string().optional(),
  }),
  beforeLoad: async ({ search }) => {
    if ((await getSessionFn()).user) {
      throw redirect({ href: safePath(search.redirect) ?? '/' })
    }
  },
  head: () =>
    seo({
      title: 'Sign in',
      description: 'Sign in to Misri with Google, an email link or a passkey.',
      noindex: true,
    }),
  component: SignIn,
})

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  '2fa_expired': 'Your verification window expired. Sign in again.',
  INVALID_TOKEN:
    "That sign-in link isn't valid or was already used. Ask for a new one.",
  EXPIRED_TOKEN: 'That sign-in link expired. Ask for a new one.',
}

function SignIn() {
  const { error, redirect: wanted } = Route.useSearch()
  const { googleEnabled } = useAdmin()
  const next = safePath(wanted) ?? '/'
  const invited = next.startsWith('/join/')
  // keep the destination past detours the URL can't carry (two-step, Google)
  useEffect(() => rememberNext(next), [next])
  const [redirecting, setRedirecting] = useState(false)
  const [withEmail, setWithEmail] = useState(false)

  useEffect(() => {
    if (error) {
      toast.error(
        ERROR_MESSAGES[error] ?? "We couldn't sign you in. Try again.",
      )
    }
  }, [error])

  async function signInWithGoogle() {
    setRedirecting(true)
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: next,
      // a brand-new account starts with onboarding, like Zadaci's
      newUserCallbackURL: `/onboarding?redirect=${encodeURIComponent(next)}`,
      errorCallbackURL: '/auth/signin',
    })
    if (error) {
      setRedirecting(false)
      toast.error(error.message ?? "We couldn't reach Google. Try again.")
    }
  }

  return (
    <AuthShell
      title={invited ? 'Sign in to see your invite' : 'Sign in to Misri'}
      description={
        invited
          ? "New here? You'll set up your account in a minute, then come straight back to the invite."
          : 'New here? Your account is made the first time you sign in.'
      }
    >
      {withEmail ? (
        <MagicLinkForm next={next} onBack={() => setWithEmail(false)} />
      ) : (
        <div className="flex flex-col gap-2">
          {googleEnabled && (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={redirecting}
              aria-busy={redirecting}
              onClick={signInWithGoogle}
            >
              {redirecting ? <Spinner /> : <GoogleLogo className="size-4" />}
              Continue with Google
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setWithEmail(true)}
          >
            <Mail className="size-4" aria-hidden />
            Continue with email
          </Button>
          <PasskeySignInButton next={next} />
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">
        By continuing you agree to the{' '}
        <Link to="/terms" className="underline underline-offset-4">
          terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline underline-offset-4">
          privacy
        </Link>{' '}
        pages.
      </p>
    </AuthShell>
  )
}

/** "Email me a sign-in link", for anyone without Google. */
function MagicLinkForm({ next, onBack }: { next: string; onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!address) return
    setSending(true)
    const { error } = await authClient.signIn.magicLink({
      email: address,
      callbackURL: next,
      newUserCallbackURL: `/onboarding?redirect=${encodeURIComponent(next)}`,
      errorCallbackURL: '/auth/signin',
    })
    setSending(false)
    if (error) {
      toast.error(
        error.status === 429
          ? 'Too many tries. Wait a minute and try again.'
          : (error.message ?? "We couldn't send the link. Try again."),
      )
      return
    }
    setSentTo(address)
  }

  if (sentTo) {
    return (
      <div className="rounded-xl border p-4 text-center text-sm" role="status">
        <MailOpen className="mx-auto mb-2 size-6 text-primary" aria-hidden />
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-muted-foreground">
          We sent a sign-in link to <b className="text-foreground">{sentTo}</b>.
          It works once and expires in 10 minutes.
        </p>
        <div className="mt-3 flex justify-center gap-4 text-xs">
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setSentTo(null)}
          >
            Use a different email
          </button>
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={onBack}
          >
            Other ways to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={send}>
      <label htmlFor="magic-email" className="text-sm font-medium">
        Email
      </label>
      <Input
        id="magic-email"
        autoFocus
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={sending}
        aria-busy={sending}
      >
        {sending ? <Spinner /> : <Mail className="size-4" aria-hidden />}
        Send sign-in link
      </Button>
      <button
        type="button"
        className="mt-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        Other ways to sign in
      </button>
    </form>
  )
}
