import type { PushMessage } from './push.ts'
import { ordinal } from './widgets.ts'

/** A game as the weekly summary needs it. */
export interface WeekMatch {
  homeUserId: string | null
  awayUserId: string | null
  whiteUserId: string | null
  result: 'white' | 'black' | 'draw' | null
  winnerUserId: string | null
  voided: boolean
  endedAt: Date | null
  dueAt: Date
}

const WEEK = 7 * 24 * 60 * 60 * 1000

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/**
 * Pure: one player's week in one competition (last week's results, their
 * place, games due in the coming week), or null when there's nothing to say.
 */
export function weeklySummary(
  competition: { name: string; slug: string },
  games: Array<WeekMatch>,
  userId: string,
  place: number | null,
  now: Date,
): PushMessage | null {
  const mine = games.filter(
    (g) => !g.voided && (g.homeUserId === userId || g.awayUserId === userId),
  )
  let won = 0
  let drawn = 0
  let lost = 0
  for (const g of mine) {
    if (!g.result || !g.endedAt) continue
    if (now.getTime() - g.endedAt.getTime() > WEEK) continue
    if (g.result === 'draw') drawn++
    else if ((g.result === 'white') === (g.whiteUserId === userId)) won++
    else lost++
  }
  const due = mine.filter(
    (g) =>
      !g.result &&
      !g.winnerUserId &&
      g.dueAt.getTime() > now.getTime() &&
      g.dueAt.getTime() - now.getTime() <= WEEK,
  ).length
  if (won + drawn + lost === 0 && due === 0) return null

  const parts: Array<string> = []
  if (won + drawn + lost > 0) {
    const results = [
      won && count(won, 'win', 'wins'),
      drawn && count(drawn, 'draw', 'draws'),
      lost && count(lost, 'loss', 'losses'),
    ].filter(Boolean)
    parts.push(`Last week: ${results.join(', ')}.`)
  }
  if (place) parts.push(`You're ${ordinal(place)}.`)
  if (due > 0) parts.push(`${count(due, 'game', 'games')} due this week.`)
  return {
    userId,
    title: `Your week in ${competition.name}`,
    body: parts.join(' '),
    url: `/c/${competition.slug}`,
    tag: `weekly-${competition.slug}`,
  }
}
