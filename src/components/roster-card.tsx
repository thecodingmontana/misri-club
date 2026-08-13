import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { Lock, Plus, UserMinus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { addPlayerFn, setPlayerActiveFn } from '#/server/league.functions'
import { PlayerLink } from '#/components/player-link'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { useAdmin } from '#/lib/use-admin'

interface RosterEntry {
  username: string
  active: boolean
}

/**
 * Roster management. For a public club the sync job keeps this list current on
 * its own; for a private club chess.com refuses to enumerate members, so an
 * admin adds them by username here (still verified against chess.com).
 */
export function RosterCard({
  roster,
  membersListable,
  membersCount,
  clubUrl,
}: {
  roster: Array<RosterEntry>
  membersListable: boolean
  membersCount: number
  clubUrl: string
}) {
  const { isAdmin } = useAdmin()
  const router = useRouter()
  const [username, setUsername] = useState('')

  const addPlayer = useServerFn(addPlayerFn)
  const setActive = useServerFn(setPlayerActiveFn)

  const add = useMutation({
    mutationFn: (value: string) => addPlayer({ data: { username: value } }),
    onSuccess: async (result) => {
      setUsername('')
      await router.invalidate()
      toast.success(
        result.status === 'added'
          ? `${result.username} added to the roster`
          : `${result.username} is active again`,
      )
    },
    onError: (error: Error) =>
      toast.error('Could not add player', { description: error.message }),
  })

  const toggle = useMutation({
    mutationFn: (entry: RosterEntry) =>
      setActive({ data: { username: entry.username, active: !entry.active } }),
    onSuccess: async (result) => {
      await router.invalidate()
      toast.success(
        result.active
          ? `${result.username} is active again`
          : `${result.username} marked inactive`,
      )
    },
    onError: (error: Error) =>
      toast.error('Could not update player', { description: error.message }),
  })

  const active = roster.filter((entry) => entry.active)
  const inactive = roster.filter((entry) => !entry.active)

  return (
    <Card className="rise-in">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="display text-xl">Roster</CardTitle>
        <span className="numeric text-xs text-muted-foreground">
          {active.length}
          {membersCount > 0 ? ` / ${membersCount}` : ''}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {!membersListable && (
          <div className="flex items-start gap-3 rounded-lg border border-brass/25 bg-brass/5 px-3 py-2.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-brass" />
            <p>
              <a
                href={clubUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-foreground hover:text-brass"
              >
                This club is private
              </a>
              , so chess.com won&apos;t list its members.{' '}
              {isAdmin
                ? 'Add them by username below — everything else (games, ratings, archives) syncs normally.'
                : 'Members are added by hand — everything else (games, ratings, archives) syncs normally.'}{' '}
              Making the club public on chess.com switches the roster to fully
              automatic.
            </p>
          </div>
        )}

        {isAdmin && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (username.trim()) add.mutate(username.trim())
          }}
          className="flex gap-2"
        >
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="chess.com username"
            aria-label="chess.com username"
            autoComplete="off"
            spellCheck={false}
            className="h-9"
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            className="h-9 shrink-0 gap-1.5"
            disabled={add.isPending || !username.trim()}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </form>
        )}

        {roster.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No members tracked yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {[...active, ...inactive].map((entry) => (
              <li
                key={entry.username}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <PlayerLink
                  username={entry.username}
                  muted={!entry.active}
                  className="truncate text-sm"
                />
                {isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-brass"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate(entry)}
                    title={
                      entry.active
                        ? 'Mark inactive (keeps their history)'
                        : 'Re-activate'
                    }
                  >
                    {entry.active ? (
                      <UserMinus className="size-3.5" />
                    ) : (
                      <UserPlus className="size-3.5" />
                    )}
                  </Button>
                ) : (
                  !entry.active && (
                    <span className="shrink-0 text-xs text-muted-foreground/70">
                      inactive
                    </span>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
