import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { QRCodeSVG } from 'qrcode.react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '#/components/auth'
import { KeyRound, LogOut, ShieldCheck, Trash } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { authClient, passkeyCancelled } from '#/lib/auth-client'
import { formatDate } from '#/lib/format'
import { seo } from '#/lib/seo'
import { useAdmin } from '#/lib/use-admin'
import { getSessionFn } from '#/server/auth.functions'

export const Route = createFileRoute('/account')({
  beforeLoad: async () => {
    if (!(await getSessionFn()).user) {
      throw redirect({ to: '/auth/signin', search: { redirect: '/account' } })
    }
  },
  head: () =>
    seo({
      title: 'Your account',
      description: 'Passkeys and two-step verification.',
      noindex: true,
    }),
  component: AccountPage,
})

/** Better Auth answers with `{ data, error }`; turn an error into a throw. */
async function unwrap<T>(
  call: Promise<{ data: T | null; error: { message?: string } | null }>,
): Promise<T> {
  const { data, error } = await call
  if (error) throw new Error(error.message ?? 'Something went wrong.')
  return data as T
}

function AccountPage() {
  const { user } = useAdmin()
  const navigate = useNavigate()
  const router = useRouter()
  if (!user) return null

  return (
    <div className="space-y-5 pt-2">
      <section className="text-center">
        <p className="kicker">Signed in</p>
        <h1 className="display mt-1 text-2xl">{user.name}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
      </section>

      <Section
        title="Passkeys"
        lead="Sign in with your fingerprint, face or device PIN."
      >
        <Passkeys />
      </Section>

      <Section
        title="Two-step verification"
        lead="Ask for a code from your authenticator app when signing in on a new device."
      >
        <TwoFactor enabled={user.twoFactorEnabled} />
      </Section>

      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          await authClient.signOut()
          await router.invalidate()
          await navigate({ to: '/' })
          toast.success('Signed out')
        }}
      >
        <LogOut className="size-4" aria-hidden />
        Sign out
      </Button>
    </div>
  )
}

function Section({
  title,
  lead,
  children,
}: {
  title: string
  lead: string
  children: ReactNode
}) {
  return (
    <section>
      <h2 className="display px-1 text-lg">{title}</h2>
      <p className="mb-2 px-1 text-xs text-muted-foreground">{lead}</p>
      <Card>
        <CardContent className="space-y-3">{children}</CardContent>
      </Card>
    </section>
  )
}

interface PasskeyRow {
  id: string
  name?: string | null
  createdAt?: Date | string | null
}

function Passkeys() {
  const [keys, setKeys] = useState<Array<PasskeyRow> | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await authClient.passkey.listUserPasskeys()
    setKeys((data as Array<PasskeyRow> | null) ?? [])
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    void load()
  }, [])

  async function add() {
    setBusy(true)
    const { error } = await authClient.passkey.addPasskey()
    setBusy(false)
    if (!error) {
      toast.success('Passkey added', {
        description: 'Next time, sign in with your passkey.',
      })
      return load()
    }
    if (!passkeyCancelled(error)) {
      toast.error("Couldn't add a passkey", { description: error.message })
    }
  }

  async function remove(id: string) {
    try {
      await unwrap(authClient.passkey.deletePasskey({ id }))
      toast.success('Passkey removed')
      await load()
    } catch (error) {
      toast.error("Couldn't remove it", {
        description: (error as Error).message,
      })
    }
  }

  return (
    <>
      {keys === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No passkeys yet.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center gap-2 py-2 text-sm">
              <KeyRound className="size-4 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {key.name || 'Passkey'}
                {key.createdAt && (
                  <span className="text-muted-foreground">
                    {' '}
                    · added {formatDate(key.createdAt)}
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${key.name || 'passkey'}`}
                onClick={() => remove(key.id)}
              >
                <Trash className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        className="w-full"
        disabled={busy}
        aria-busy={busy}
        onClick={add}
      >
        {busy ? <Spinner /> : <KeyRound className="size-4" aria-hidden />}
        Add a passkey
      </Button>
    </>
  )
}

function TwoFactor({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(
    null,
  )
  const [codes, setCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function run<T>(work: () => Promise<T>, failure: string) {
    setBusy(true)
    try {
      return await work()
    } catch (error) {
      toast.error(failure, { description: (error as Error).message })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    const data = await run(
      () => unwrap(authClient.twoFactor.enable({ method: 'totp' })),
      "Couldn't start setup",
    )
    if (data?.method !== 'totp') return
    setCode('')
    setSetup({ uri: data.totpURI, codes: data.backupCodes })
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    const ok = await run(
      () => unwrap(authClient.twoFactor.verifyTotp({ code: code.trim() })),
      "That code didn't work",
    )
    if (ok === null) return
    toast.success('Two-step verification is on')
    setCodes(setup?.codes ?? null)
    setSetup(null)
    await router.invalidate()
  }

  if (setup) {
    return (
      <form className="space-y-3" onSubmit={verify}>
        <p className="text-sm">
          Scan this with your authenticator app, then enter the code it shows.
        </p>
        <div className="mx-auto w-fit rounded-xl bg-white p-3">
          <QRCodeSVG value={setup.uri} size={168} />
        </div>
        <Input
          aria-label="6-digit code"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          className="text-center font-mono tracking-[0.3em]"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setSetup(null)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={code.length !== 6 || busy}
          >
            {busy && <Spinner />}
            Turn on
          </Button>
        </div>
      </form>
    )
  }

  if (!enabled) {
    return (
      <Button className="w-full" disabled={busy} onClick={start}>
        {busy ? <Spinner /> : <ShieldCheck className="size-4" aria-hidden />}
        Set up two-step verification
      </Button>
    )
  }

  return (
    <>
      <p className="flex items-center gap-2 text-sm">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        Two-step verification is on.
      </p>
      {codes ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Save these backup codes somewhere safe. Each works once, if you lose
            your phone.
          </p>
          <ul className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-3 font-mono text-sm">
            {codes.map((backup) => (
              <li key={backup}>{backup}</li>
            ))}
          </ul>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            const data = await run(
              () => unwrap(authClient.twoFactor.generateBackupCodes({})),
              "Couldn't make new codes",
            )
            if (data) setCodes(data.backupCodes)
          }}
        >
          Make new backup codes
        </Button>
      )}
      <Button
        variant="ghost"
        className="w-full text-destructive"
        disabled={busy}
        onClick={async () => {
          const ok = await run(
            () => unwrap(authClient.twoFactor.disable({})),
            "Couldn't turn it off",
          )
          if (ok === null) return
          toast.success('Two-step verification is off')
          setCodes(null)
          await router.invalidate()
        }}
      >
        Turn off two-step verification
      </Button>
    </>
  )
}
