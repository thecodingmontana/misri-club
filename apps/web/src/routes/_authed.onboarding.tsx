import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthShell, Spinner } from '#/components/auth'
import { ChessAccount } from '#/components/chess-account'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { authClient, safePath } from '#/lib/auth-client'
import { seo } from '#/lib/seo'

/**
 * First sign-in, like Zadaci's onboarding: your name, then your chess.com
 * account (it must exist, and you prove it's yours). Signed-in pages send you
 * here until it's done.
 */
export const Route = createFileRoute('/_authed/onboarding')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  // Already onboarded: nothing to do here.
  beforeLoad: ({ context, search }) => {
    if (context.user.chessUsername) {
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
    await navigate({ href: safePath(wanted) ?? '/start' })
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
            : 'Your games and results come from chess.com, so link the account you play on.'}
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
