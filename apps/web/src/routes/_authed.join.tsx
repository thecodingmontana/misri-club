import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { type FormEvent, useState } from 'react'
import { Spinner } from '#/components/auth'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { seo } from '#/lib/seo'
import { toast } from '#/lib/toast'
import { joinCompetitionFn } from '#/server/competitions.functions'

export const Route = createFileRoute('/_authed/join')({
  head: () =>
    seo({
      title: 'Join',
      description: 'Join a competition with an invite code.',
      noindex: true,
    }),
  component: Join,
})

function Join() {
  const join = useServerFn(joinCompetitionFn)
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const { slug, pending } = await join({ data: { code } })
      if (pending) toast.success('Request sent to the organiser')
      await navigate({ to: '/c/$slug', params: { slug } })
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5 pt-2">
      <header className="text-center">
        <h1 className="display text-3xl">Join with a code</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask the organiser for the 8-character code.
        </p>
      </header>
      <form
        className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card"
        onSubmit={submit}
      >
        <label htmlFor="join-code" className="text-sm font-medium">
          Invite code
        </label>
        <Input
          id="join-code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          className="numeric text-center text-lg tracking-[0.3em] uppercase"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={busy || code.trim().length !== 8}
        >
          {busy && <Spinner />}
          Join
        </Button>
      </form>
    </div>
  )
}
