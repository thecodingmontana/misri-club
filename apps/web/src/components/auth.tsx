import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { KeyRound, Loader } from '#/components/icons'
import { ThemeToggle } from '#/components/theme-toggle'
import { Button } from '#/components/ui/button'
import { authClient, passkeyCancelled } from '#/lib/auth-client'
import { toast } from '#/lib/toast'

/** The whole screen for each sign-in step, laid out like Zadaci's. */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Link to="/" className="display rounded-md text-4xl">
            Misri
          </Link>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-balance">{title}</h1>
            <p className="text-sm text-pretty text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}

export function Spinner() {
  return <Loader className="size-4 animate-spin" aria-hidden />
}

export function PasskeySignInButton({
  label = 'Sign in with a passkey',
  next = '/',
}: {
  label?: string
  next?: string
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true)
        const { error } = await authClient.signIn.passkey()
        if (!error) {
          await router.invalidate()
          return navigate({ href: next })
        }
        setBusy(false)
        if (!passkeyCancelled(error)) {
          toast.error('Passkey sign-in failed', { desc: error.message })
        }
      }}
    >
      {busy ? <Spinner /> : <KeyRound className="size-4" aria-hidden />}
      {label}
    </Button>
  )
}
