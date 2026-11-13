import { useNavigate, useRouter } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Loader } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { authClient, passkeyCancelled } from '#/lib/auth-client'

/** The frame every sign-in step sits in. */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-sm py-10">
      <Card className="rise-in">
        <CardContent className="flex flex-col gap-4">
          <div className="text-center">
            <h1 className="display text-2xl">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
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
          toast.error('Passkey sign-in failed', { description: error.message })
        }
      }}
    >
      {busy ? <Spinner /> : <KeyRound className="size-4" aria-hidden />}
      {label}
    </Button>
  )
}
