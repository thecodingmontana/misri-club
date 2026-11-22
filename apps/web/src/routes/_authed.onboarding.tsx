import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { AuthShell, Spinner } from '#/components/auth'
import { ChessAccount } from '#/components/chess-account'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { authClient, safePath, takeNext } from '#/lib/auth-client'
import { seo } from '#/lib/seo'
import { forgetSession } from '#/lib/session-cache'
import { toast } from '#/lib/toast'
import { skipChessFn } from '#/server/auth.functions'

/**
 * First sign-in, like Zadaci's onboarding: your name, then your chess.com
 * account (it must exist, and you prove it's yours) or skip it. Signed-in
 * pages send you here until it's done.
 */
export const Route = createFileRoute('/_authed/onboarding')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  // Already onboarded: nothing to do here.
  beforeLoad: ({ context, search }) => {
    if (context.user.onboarded) {
      throw redirect({ href: safePath(search.redirect) ?? '/start' })
    }
  },
  head: () =>
    seo({
      title: 'Welcome',
      description: 'Set up your Misri account.',
      noindex: true,
    }),
  component: Onboarding,
})

function Onboarding() {
  const { user } = Route.useRouteContext()
  const { redirect: wanted } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState(user.name)
  const [saving, setSaving] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const skipChess = useServerFn(skipChessFn)

  async function saveName(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    const { error } = await authClient.updateUser({ name: trimmed })
    setSaving(false)
    if (error) {
      toast.error(error.message ?? "Couldn't save your name. Try again.")
      return
    }
    setStep(2)
  }

  async function finish() {
    await router.invalidate()
    await navigate({ href: safePath(wanted) ?? takeNext() ?? '/start' })
  }

  return (
    <AuthShell
      title={step === 1 ? 'Welcome to Misri' : 'Your chess.com account'}
      description={
        <>
          <span className="mb-2 block text-xs font-medium tracking-wide uppercase">
            Step {step} of 2
          </span>
          {step === 1
            ? 'What should other players call you?'
            : 'Link the chess.com account you play on, so competitions can read your results from your games. Playing over the board or elsewhere? Skip it.'}
        </>
      }
    >
      {step === 1 ? (
        <form className="flex flex-col gap-2" onSubmit={saveName}>
          <label htmlFor="onboarding-name" className="text-sm font-medium">
            Your name
          </label>
          <Input
            id="onboarding-name"
            autoComplete="name"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={saving || !name.trim()}
          >
            {saving && <Spinner />}
            Continue
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <ChessAccount onLinked={finish} />
          <Button
            variant="outline"
            className="w-full"
            disabled={skipping}
            onClick={async () => {
              setSkipping(true)
              try {
                await skipChess()
                // the guard reuses the last session check; this one is stale
                forgetSession()
                await finish()
              } catch (error) {
                toast.error((error as Error).message)
                setSkipping(false)
              }
            }}
          >
            {skipping && <Spinner />}
            Skip: I don't play on chess.com
          </Button>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setStep(1)}
          >
            Back
          </button>
        </div>
      )}
    </AuthShell>
  )
}
