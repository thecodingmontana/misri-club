import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { AuthShell, PasskeySignInButton, Spinner } from '#/components/auth'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { authClient, takeNext } from '#/lib/auth-client'
import { seo } from '#/lib/seo'
import { toast } from '#/lib/toast'
import { getSessionFn } from '#/server/auth.functions'

export const Route = createFileRoute('/auth/two-factor')({
  // Set by the sign-in hook: which second steps this account has.
  validateSearch: z.object({ methods: z.string().optional() }),
  beforeLoad: async () => {
    if ((await getSessionFn()).user) throw redirect({ to: '/' })
  },
  head: () =>
    seo({
      title: 'Two-step verification',
      description: 'Confirm it is you to finish signing in.',
      noindex: true,
    }),
  component: VerifyTwoFactor,
})

function VerifyTwoFactor() {
  const { methods = 'totp' } = Route.useSearch()
  const hasTotp = methods.includes('totp')
  const hasPasskey = methods.includes('passkey')
  const navigate = useNavigate()
  const router = useRouter()
  const [mode, setMode] = useState<'totp' | 'backup'>('totp')
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const [verifying, setVerifying] = useState(false)

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (!code) return
    setVerifying(true)
    const { error } =
      mode === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({
            code: code.trim(),
            trustDevice,
          })
    if (!error) {
      await router.invalidate()
      await navigate({ href: takeNext() ?? '/' })
      return
    }
    setVerifying(false)
    setCode('')
    if (error.code === 'INVALID_TWO_FACTOR_COOKIE') {
      await navigate({ to: '/auth/signin', search: { error: '2fa_expired' } })
      return
    }
    toast.error(
      error.code === 'INVALID_CODE' || error.code === 'INVALID_BACKUP_CODE'
        ? "That code didn't work. Check it and try again."
        : (error.message ?? 'Verification failed. Try again.'),
    )
  }

  if (!hasTotp) {
    return (
      <AuthShell
        title="Two-step verification"
        description="Confirm it's you with the passkey you set up."
      >
        <PasskeySignInButton label="Continue with your passkey" />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Two-step verification"
      description={
        mode === 'totp'
          ? 'Enter the 6-digit code from your authenticator app.'
          : 'Enter one of the backup codes you saved when you turned this on.'
      }
    >
      <form className="flex flex-col gap-4" onSubmit={verify}>
        <Input
          autoFocus
          aria-label={mode === 'totp' ? '6-digit code' : 'Backup code'}
          autoComplete="one-time-code"
          inputMode={mode === 'totp' ? 'numeric' : 'text'}
          maxLength={mode === 'totp' ? 6 : 24}
          spellCheck={false}
          value={code}
          onChange={(event) =>
            setCode(
              mode === 'totp'
                ? event.target.value.replace(/\D/g, '')
                : event.target.value,
            )
          }
          disabled={verifying}
          placeholder={mode === 'totp' ? '123456' : 'xxxxx-xxxxx'}
          className="h-11 text-center font-mono text-lg tracking-[0.3em]"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
            className="size-4 accent-primary"
          />
          Trust this device for 30 days
        </label>
        <Button type="submit" size="lg" disabled={!code || verifying}>
          {verifying && <Spinner />}
          Verify
        </Button>
      </form>
      {hasPasskey && <PasskeySignInButton label="Use a passkey instead" />}
      <Button
        variant="link"
        className="text-muted-foreground"
        onClick={() => {
          setMode(mode === 'totp' ? 'backup' : 'totp')
          setCode('')
        }}
      >
        {mode === 'totp'
          ? 'Use a backup code instead'
          : 'Use your authenticator app instead'}
      </Button>
    </AuthShell>
  )
}
