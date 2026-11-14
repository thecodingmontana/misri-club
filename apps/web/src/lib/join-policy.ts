/**
 * Who may join a competition, and the matches a late joiner gets. Pure, so the
 * server function and the page show the same rule.
 */

type Format = 'league' | 'knockout'
type Status = 'open' | 'running' | 'finished'

export type JoinDecision = { ok: true } | { ok: false; reason: string }

export function canJoin({
  format,
  status,
  allowLateEntry,
}: {
  format: Format
  status: Status
  allowLateEntry: boolean
}): JoinDecision {
  if (status === 'open') return { ok: true }
  if (status === 'finished') {
    return { ok: false, reason: 'This competition has finished.' }
  }
  if (format === 'knockout') {
    return { ok: false, reason: 'This tournament has started.' }
  }
  return allowLateEntry
    ? { ok: true }
    : {
        ok: false,
        reason: "This league has started and isn't taking late entries.",
      }
}

const DAY = 24 * 60 * 60 * 1000

export interface LateMatch {
  round: number
  leg: 1 | 2
  homeId: string
  awayId: string
  opensAt: Date
  dueAt: Date
}

/**
 * A late joiner meets every existing member once (twice, home and away, when
 * the league has two legs), all in one extra round. The window opens now and
 * closes with the league's last window, or one matchday from now if later.
 */
export function lateEntryMatches({
  userId,
  memberIds,
  legs,
  round,
  matchdayDays,
  latestDueAt,
  now,
}: {
  userId: string
  /** Existing members, not including the joiner. */
  memberIds: Array<string>
  legs: number
  round: number
  matchdayDays: number
  latestDueAt: Date | null
  now: Date
}): Array<LateMatch> {
  const soonest = now.getTime() + matchdayDays * DAY
  const dueAt = new Date(Math.max(latestDueAt?.getTime() ?? 0, soonest))
  return memberIds
    .filter((id) => id !== userId)
    .flatMap((opponent) => {
      const first: LateMatch = {
        round,
        leg: 1,
        homeId: userId,
        awayId: opponent,
        opensAt: now,
        dueAt,
      }
      return legs === 2
        ? [first, { ...first, leg: 2, homeId: opponent, awayId: userId }]
        : [first]
    })
}
