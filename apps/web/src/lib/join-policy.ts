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

/** A scheduled league round as the planner sees it. */
export interface PlannedRound {
  round: number
  opensAt: Date
  dueAt: Date
  /** bye rows in this round: who sits out, and the row to turn into a game */
  byes: Array<{ matchId: string; userId: string }>
  /** players who already have a game in this round */
  busy: Set<string>
}

export interface LatePlan {
  /** bye rows that become a real game (the joiner takes the empty seat) */
  fromByes: Array<{ matchId: string; fixture: MissingFixture }>
  /** extra games inside a scheduled round, with that round's window */
  inRounds: Array<{
    round: number
    opensAt: Date
    dueAt: Date
    fixture: MissingFixture
  }>
  /** what fits nowhere: the shared catch-up round */
  catchUp: Array<MissingFixture>
}

/**
 * Where a late joiner's games go, as a fresh draw would put them: first into
 * the byes of rounds still to come (the joiner plays whoever sat out), then
 * into any remaining round where both players are free, and only the rest
 * into a catch-up round. Nobody plays twice in one round. A round counts as
 * remaining while half a matchday of it (and at least a day) is left.
 */
export function placeLateGames({
  missing,
  rounds,
  now,
  matchdayDays,
}: {
  missing: Array<MissingFixture>
  rounds: Array<PlannedRound>
  now: Date
  matchdayDays: number
}): LatePlan {
  const plan: LatePlan = { fromByes: [], inRounds: [], catchUp: [] }
  // enough time left to play: half a matchday, and never under a day
  const enough = Math.max(DAY, (matchdayDays * DAY) / 2)
  const open = rounds
    .filter((r) => r.dueAt.getTime() - now.getTime() >= enough)
    .sort((a, b) => a.round - b.round)
  // nobody plays twice in one round: track who is busy where
  const busy = new Map(open.map((r) => [r.round, new Set(r.busy)]))
  const usedByes = new Set<string>()
  const left = [...missing]

  for (const r of open) {
    for (const bye of r.byes) {
      const roundBusy = busy.get(r.round) as Set<string>
      const at = left.findIndex(
        (f) =>
          (f.homeId === bye.userId || f.awayId === bye.userId) &&
          !roundBusy.has(f.homeId === bye.userId ? f.awayId : f.homeId),
      )
      if (at === -1 || usedByes.has(bye.matchId)) continue
      const [fixture] = left.splice(at, 1)
      usedByes.add(bye.matchId)
      plan.fromByes.push({ matchId: bye.matchId, fixture })
      roundBusy.add(fixture.homeId)
      roundBusy.add(fixture.awayId)
    }
  }

  // then any round where both players are free (two late joiners, say)
  for (const r of open) {
    const roundBusy = busy.get(r.round) as Set<string>
    const at = left.findIndex(
      (f) => !roundBusy.has(f.homeId) && !roundBusy.has(f.awayId),
    )
    if (at === -1) continue
    const [fixture] = left.splice(at, 1)
    plan.inRounds.push({
      round: r.round,
      opensAt: r.opensAt,
      dueAt: r.dueAt,
      fixture,
    })
    roundBusy.add(fixture.homeId)
    roundBusy.add(fixture.awayId)
  }

  plan.catchUp = left
  return plan
}
