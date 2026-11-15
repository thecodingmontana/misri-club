import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { authClient } from '#/lib/auth-client'
import { deviceName } from '#/lib/device-name'
import { formatDate } from '#/lib/format'
import { toast } from '#/lib/toast'

async function unwrap<T>(
  call: Promise<{ data: T | null; error: { message?: string } | null }>,
): Promise<T> {
  const { data, error } = await call
  if (error) throw new Error(error.message ?? 'Something went wrong.')
  return data as T
}

/** The name other players see on tables and fixtures. */
export function NameForm({ name }: { name: string }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const changed = value.trim() !== name && value.trim().length > 0
  return (
    <form
      className="flex gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!changed) return
        setBusy(true)
        try {
          await unwrap(authClient.updateUser({ name: value }))
          await router.invalidate()
          toast.success('Name saved')
        } catch (error) {
          toast.error("Couldn't save your name", {
            desc: (error as Error).message,
          })
        } finally {
          setBusy(false)
        }
      }}
    >
      <Input
        aria-label="Your name"
        maxLength={50}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={!changed || busy}>
        Save
      </Button>
    </form>
  )
}

/** Every device signed in to this account, with a way to sign each one out. */
export function DeviceList() {
  const queryClient = useQueryClient()
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const [list, current] = await Promise.all([
        unwrap(authClient.listSessions()),
        unwrap(authClient.getSession()),
      ])
      return { list, currentToken: current?.session.token ?? null }
    },
  })
  const [busy, setBusy] = useState<string | null>(null)

  if (sessions.isPending) {
    return <p className="text-sm text-muted-foreground">Loading devices…</p>
  }
  if (sessions.isError) {
    return (
      <p className="text-sm text-destructive">
        Couldn't load your devices. Reload to try again.
      </p>
    )
  }

  const { list, currentToken } = sessions.data
  async function signOut(token: string) {
    setBusy(token)
    try {
      await unwrap(authClient.revokeSession({ token }))
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.success('Signed that device out')
    } catch (error) {
      toast.error("Couldn't sign it out", { desc: (error as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ul className="space-y-2">
      {list.map((s) => {
        const here = s.token === currentToken
        return (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {deviceName(s.userAgent)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {here ? 'This device' : `Signed in ${formatDate(s.createdAt)}`}
              </span>
            </span>
            {!here && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === s.token}
                onClick={() => signOut(s.token)}
              >
                Sign out
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
