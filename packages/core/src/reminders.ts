import type { PushMessage } from './push.ts'

export interface DueMatch {
  matchId: string
  homeUserId: string
  awayUserId: string
  homeName: string
  awayName: string
  competition: string
  slug: string
}

/**
 * Pure: one reminder to each player of each match, naming the opponent; a day
 * or an hour before the deadline (same tag: the hour one replaces the day one).
 */
export function reminderPushes(
  due: DueMatch[],
  left: 'day' | 'hour' = 'day',
): PushMessage[] {
  return due.flatMap((m) =>
    [
      [m.homeUserId, m.awayName],
      [m.awayUserId, m.homeName],
    ].map(([userId, opponent]) => ({
      userId,
      title: `About ${left === 'day' ? 'a day' : 'an hour'} left in ${m.competition}`,
      body: `Play ${opponent} on chess.com before the deadline.`,
      url: `/c/${m.slug}`,
      tag: `due-${m.matchId}`,
    })),
  )
}
