/**
 * Who may join a competition, and the matches a late joiner gets. Pure, so the
 * server function and the page show the same rule.
 */

type Format = 'league' | 'knockout' | 'challenge' | 'groups'
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
  if (format === 'challenge') {
    return { ok: false, reason: 'This challenge has started.' }
  }
  if (format === 'groups') {
    return { ok: false, reason: 'The groups have been drawn.' }
  }
  return allowLateEntry
    ? { ok: true }
    : {
        ok: false,
        reason: "This league has started and isn't taking late entries.",
      }
}

const DAY = 24 * 60 * 60 * 1000

export interface Fixture {
  homeUserId: string | null
  awayUserId: string | null
}

export interface MissingFixture {
  leg: 1 | 2
  homeId: string
  awayId: string
}

/**
 * The games a running league still owes between its current members: every
 * pair meets once, or home and away with two legs. `memberIds` is in join
 * order; the later joiner is at home in leg 1. Byes and leavers' games never
 * count, so a league built by the round-robin owes nothing.
 */
export function missingFixtures(
  memberIds: Array<string>,
  fixtures: Array<Fixture>,
  legs: number,
): Array<MissingFixture> {
  const played = new Set(fixtures.map((f) => `${f.homeUserId}>${f.awayUserId}`))
  return memberIds.flatMap((later, index) =>
    memberIds.slice(0, index).flatMap((earlier): Array<MissingFixture> => {
      const out = played.has(`${later}>${earlier}`)
      const back = played.has(`${earlier}>${later}`)
      if (legs !== 2) {
        return out || back ? [] : [{ leg: 1, homeId: later, awayId: earlier }]
      }
      return [
        ...(out ? [] : [{ leg: 1 as const, homeId: later, awayId: earlier }]),
        ...(back ? [] : [{ leg: 2 as const, homeId: earlier, awayId: later }]),
      ]
    }),
  )
}

/**
 * Where late games go: the late round still open, its deadline pushed out so
 * the newest joiner gets at least one matchday; otherwise a new round after
 * the last, due with the league's last window or a matchday from now if later.
 */
export function lateRoundWindow({
  openLate,
  lastRound,
  lastDueAt,
  matchdayDays,
  now,
}: {
  openLate: { round: number; dueAt: Date } | null
  lastRound: number
  lastDueAt: Date | null
  matchdayDays: number
  now: Date
}): { round: number; dueAt: Date } {
  const soonest = now.getTime() + matchdayDays * DAY
  if (openLate) {
    return {
      round: openLate.round,
      dueAt: new Date(Math.max(openLate.dueAt.getTime(), soonest)),
    }
  }
  return {
    round: lastRound + 1,
    dueAt: new Date(Math.max(lastDueAt?.getTime() ?? 0, soonest)),
  }
}
