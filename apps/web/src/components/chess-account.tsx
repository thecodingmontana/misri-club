import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '#/components/auth'
import { ShieldCheck } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { formatDate } from '#/lib/format'
import {
  checkChessVerificationFn,
  getChessAccountFn,
  startChessVerificationFn,
} from '#/server/chess-account.functions'

/**
 * Link a chess.com account: we check the username exists, then the player
 * proves it's theirs by putting a code in its profile's Location. Used by
 * onboarding and the account page.
 */
export function ChessAccount({
  onLinked,
}: {
  onLinked?: (username: string) => void
}) {
  const queryClient = useQueryClient()
  const getAccount = useServerFn(getChessAccountFn)
  const start = useServerFn(startChessVerificationFn)
  const check = useServerFn(checkChessVerificationFn)
  const account = useQuery({
    queryKey: ['chess-account'],
    queryFn: () => getAccount(),
  })
  const [username, setUsername] = useState('')
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['chess-account'] })

  const begin = useMutation({
    mutationFn: () => start({ data: { username } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  })
  const verify = useMutation({
    mutationFn: () => check(),
    onSuccess: async ({ username }) => {
      await refresh()
      toast.success(`Linked to ${username} on chess.com`)
      onLinked?.(username)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const data = account.data
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  if (data.status === 'verified') {
    return (
      <p className="flex items-center gap-2 text-sm">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        Linked to <b>{data.username}</b> on chess.com since{' '}
        {formatDate(data.verifiedAt)}.
      </p>
    )
  }

  if (data.status === 'pending') {
    return (
      <div className="space-y-3 text-sm">
        <p>
          <b>{data.username}</b> exists on chess.com. To prove it&apos;s yours,
          open <b>Settings → Profile</b> on chess.com, put this code in{' '}
          <b>Location</b> and save:
        </p>
        <p className="rounded-xl bg-secondary py-3 text-center font-mono text-lg tracking-widest select-all">
          {data.code}
        </p>
        <p className="text-xs text-muted-foreground">
          The code works for 30 minutes. Once you&apos;re linked you can take it
          off your profile.
        </p>
        <Button
          className="w-full"
          disabled={verify.isPending}
          onClick={() => verify.mutate()}
        >
          {verify.isPending && <Spinner />}
          Check my profile
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (username.trim()) begin.mutate()
      }}
    >
      <Input
        aria-label="chess.com username"
        placeholder="Your chess.com username"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <Button
        type="submit"
        className="shrink-0"
        disabled={begin.isPending || !username.trim()}
      >
        {begin.isPending && <Spinner />}
        Continue
      </Button>
    </form>
  )
}
