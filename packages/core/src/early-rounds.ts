/**
 * A league round finished before its window closed: the next one can open
 * now. Its deadline stays where it was, so playing early is optional.
 *
 * wait      = rounds open on their dates, as scheduled
 * auto      = the next round opens as soon as everyone has played
 * organiser = the organiser opens it with a button
 */
export type EarlyRounds = 'wait' | 'auto' | 'organiser'

export interface EarlyMatch {
  round: number
  opensAt: Date
  dueAt: Date
  homeUserId: string | null
  awayUserId: string | null
  result: string | null
  winnerUserId: string | null
  voided: boolean
}

/** The round that may open early, or null while games are still to play. */
export function earlyRound(
  matches: EarlyMatch[],
  memberIds: Set<string>,
  unplayedRule: 'organiser' | 'both_forfeit' | 'void',
  now: Date,
): number | null {
  const future = matches.filter((m) => m.opensAt > now)
  const open = matches.filter((m) => m.opensAt <= now)
  if (future.length === 0 || open.length === 0) return null
  const settled = open.every(
    (m) =>
      !m.homeUserId ||
      !m.awayUserId ||
      m.result !== null ||
      m.winnerUserId !== null ||
      m.voided ||
      // a game against someone who left never gets played
      !memberIds.has(m.homeUserId) ||
      !memberIds.has(m.awayUserId) ||
      (m.dueAt <= now && unplayedRule !== 'organiser'),
  )
  return settled ? Math.min(...future.map((m) => m.round)) : null
}
