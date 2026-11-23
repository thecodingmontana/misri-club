/**
 * What a player's leaving does to their games once a competition has started.
 * The organiser picks the league rule; a knockout always sends the opponent
 * through, since someone has to advance.
 *
 * award = every unplayed game becomes a walkover to the opponent (a win for
 *         them, a forfeit for the leaver, who drops off the table)
 * void  = all their games are removed, played ones too, as if they never entered
 * keep  = played results stand; unplayed games simply never count
 */
export type LeaveRule = 'award' | 'void' | 'keep'

export interface LeaverMatch {
  id: string
  homeUserId: string | null
  awayUserId: string | null
  result: string | null
  winnerUserId: string | null
}

export interface Settlement {
  /** walkovers to write: the match and who it goes to */
  award: Array<{ matchId: string; winnerUserId: string }>
  /** matches to delete */
  remove: string[]
}

export function settleLeaver(
  matches: LeaverMatch[],
  leaverId: string,
  rule: LeaveRule,
  format: 'league' | 'knockout' | 'challenge' | 'groups',
): Settlement {
  const theirs = matches.filter(
    (m) => m.homeUserId === leaverId || m.awayUserId === leaverId,
  )
  // only a league has a choice: elsewhere the opponent always gets the games
  const effective = format === 'league' ? rule : 'award'
  if (effective === 'void') {
    return { award: [], remove: theirs.map((m) => m.id) }
  }
  if (effective === 'keep') return { award: [], remove: [] }
  return {
    award: theirs.flatMap((m) => {
      const opponent = m.homeUserId === leaverId ? m.awayUserId : m.homeUserId
      const unplayed = m.result === null && m.winnerUserId === null
      return unplayed && opponent
        ? [{ matchId: m.id, winnerUserId: opponent }]
        : []
    }),
    remove: [],
  }
}
