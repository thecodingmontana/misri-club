import type { PushMessage } from '../server/push.server.ts'

export interface DueMatch {
  matchId: string
  homeUserId: string
  awayUserId: string
  homeName: string
  awayName: string
  competition: string
  slug: string
}

/** Pure: one reminder to each player of each match, naming the opponent. */
export function reminderPushes(due: DueMatch[]): PushMessage[] {
  return due.flatMap((m) =>
    [
      [m.homeUserId, m.awayName],
      [m.awayUserId, m.homeName],
    ].map(([userId, opponent]) => ({
      userId,
      title: `Under 24 hours left in ${m.competition}`,
      body: `Play ${opponent} on chess.com before the deadline.`,
      url: `/c/${m.slug}`,
      tag: `due-${m.matchId}`,
    })),
  )
}
