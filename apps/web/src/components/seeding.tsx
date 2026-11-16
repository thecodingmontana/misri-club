import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Spinner } from '#/components/auth'
import { ChevronDown, ChevronUp } from '#/components/icons'
import { displayName } from '#/components/match-card'
import { PlayerAvatar } from '#/components/player-chip'
import { Button } from '#/components/ui/button'
import { toast } from '#/lib/toast'
import type { PlayerView } from '#/server/competition-view.server'
import { seedCompetitionFn } from '#/server/competitions.functions'

/** The organiser orders a knockout before Start: top seed first, byes go to the top. */
export function Seeding({
  slug,
  members,
}: {
  slug: string
  members: PlayerView[]
}) {
  const router = useRouter()
  const seed = useServerFn(seedCompetitionFn)
  const [busy, setBusy] = useState<'rating' | 'move' | null>(null)

  async function save(order: string[] | 'rating') {
    setBusy(order === 'rating' ? 'rating' : 'move')
    try {
      await seed({ data: { slug, order } })
      await router.invalidate()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const move = (from: number, to: number) => {
    const order = members.map((m) => m.id)
    ;[order[from], order[to]] = [order[to], order[from]]
    void save(order)
  }

  if (members.length < 2) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Seeding</p>
          <p className="text-xs text-muted-foreground">
            Top seeds meet late and get any byes.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          disabled={busy !== null}
          onClick={() => save('rating')}
        >
          {busy === 'rating' && <Spinner />}
          By chess.com rating
        </Button>
      </div>
      <ol className="divide-y divide-border rounded-xl bg-secondary/40">
        {members.map((member, i) => (
          <li key={member.id} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="numeric w-5 text-xs font-bold text-muted-foreground">
              {i + 1}
            </span>
            <PlayerAvatar
              username={displayName(member)}
              image={member.image}
              className="size-6"
            />
            <span className="min-w-0 flex-1 truncate text-sm">
              {displayName(member)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-full"
              aria-label={`Move ${displayName(member)} up`}
              data-tip="Move up"
              disabled={busy !== null || i === 0}
              onClick={() => move(i, i - 1)}
            >
              <ChevronUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-full"
              aria-label={`Move ${displayName(member)} down`}
              data-tip="Move down"
              disabled={busy !== null || i === members.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <ChevronDown aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
    </div>
  )
}
