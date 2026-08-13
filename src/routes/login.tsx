import { useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { loginFn } from '#/server/auth.functions'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { useAdmin } from '#/lib/use-admin'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const auth = useAdmin()
  const router = useRouter()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')

  const login = useServerFn(loginFn)

  const mutation = useMutation({
    mutationFn: (value: string) => login({ data: { password: value } }),
    onSuccess: async () => {
      setPassword('')
      await router.invalidate()
      toast.success('Signed in as club admin')
      await navigate({ to: '/fixtures' })
    },
    onError: (error: Error) =>
      toast.error('Sign-in failed', { description: error.message }),
  })

  return (
    <div className="mx-auto max-w-md py-12">
      <Card className="rise-in">
        <CardHeader>
          <CardTitle className="display flex items-center gap-2 text-2xl">
            <KeyRound className="size-5 text-brass" />
            Club admin
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {auth.isAdmin ? (
            <p className="flex items-center gap-2 rounded-lg border border-brass/25 bg-brass/5 px-4 py-3 text-sm">
              <ShieldCheck className="size-4 shrink-0 text-brass" />
              You&apos;re already signed in as an admin.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                The standings, fixtures and records are public — signing in is
                only needed to manage the roster, draw fixtures, or start a new
                season.
              </p>

              {!auth.configured && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-muted-foreground">
                  No admin passphrase is configured yet. Run{' '}
                  <code className="text-foreground">
                    pnpm auth:set-password
                  </code>{' '}
                  and add the printed line to your{' '}
                  <code className="text-foreground">.env</code> file.
                </p>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (password) mutation.mutate(password)
                }}
                className="space-y-3"
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Admin passphrase"
                  aria-label="Admin passphrase"
                  autoComplete="current-password"
                  disabled={!auth.configured}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    mutation.isPending || !password || !auth.configured
                  }
                >
                  {mutation.isPending ? 'Checking…' : 'Sign in'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
