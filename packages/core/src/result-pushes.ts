import type { PushMessage } from './push.ts'

export interface RecordedResult {
  matchId: string
  homeUserId: string
  awayUserId: string
  homeName: string
  awayName: string
  result: 'white' | 'black' | 'draw'
  whiteUserId: string
}

const ordinal = (n: number) => {
  const tens = n % 100
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}

/**
 * Pure: a result chess.com just gave us, told to both players, with their
 * place in the table when the competition has one.
 */
export function resultPushes(
  results: RecordedResult[],
  competition: { name: string; slug: string },
  placeOf: (userId: string) => number | null = () => null,
): PushMessage[] {
  return results.flatMap((r) =>
    (
      [
        [r.homeUserId, r.awayName],
        [r.awayUserId, r.homeName],
      ] as const
    ).map(([userId, opponent]) => {
      const won =
        r.result !== 'draw' &&
        (r.result === 'white') === (userId === r.whiteUserId)
      const place = placeOf(userId)
      return {
        userId,
        title:
          r.result === 'draw'
            ? `You drew with ${opponent}`
            : won
              ? `You beat ${opponent}`
              : `You lost to ${opponent}`,
        body: place
          ? `You're now ${ordinal(place)} in ${competition.name}.`
          : `Recorded in ${competition.name}.`,
        url: `/c/${competition.slug}`,
        tag: `result-${r.matchId}`,
      }
    }),
  )
}
