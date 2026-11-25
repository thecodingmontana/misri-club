import type { MatchView, StandingRow } from './competition-view.ts'

/**
 * What the phone's home-screen widgets show about your competitions: the
 * next game you have to play, and where you stand. Worked out from the
 * competition pages the app already loads.
 */

interface Page {
  competition: { name: string; slug: string; status: string }
  matches: Array<MatchView>
  standings: Array<StandingRow> | null
}

export interface NextGame {
  opponent: string
  competition: string
  slug: string
  dueAt: number
}

export interface Standing {
  competition: string
  slug: string
  place: number
  of: number
  points: number
}

const shown = (p: { name: string; chessUsername: string | null }) =>
  p.chessUsername ?? p.name

/** Your open game with the nearest deadline, or null. */
export function nextGame(pages: Array<Page>, me: string): NextGame | null {
  let best: NextGame | null = null
  for (const { competition, matches } of pages) {
    for (const m of matches) {
      if (m.status !== 'live' || !m.home || !m.away) continue
      const opponent =
        m.home.id === me ? m.away : m.away.id === me ? m.home : null
      if (!opponent || (best && best.dueAt <= m.dueAt)) continue
      best = {
        opponent: shown(opponent),
        competition: competition.name,
        slug: competition.slug,
        dueAt: m.dueAt,
      }
    }
  }
  return best
}

/**
 * Your place in a running competition: the one `slug` names if given,
 * otherwise the one with your next game, otherwise the first.
 */
export function standing(
  pages: Array<Page>,
  me: string,
  slug?: string | null,
): Standing | null {
  const candidates = pages.filter(
    (p) =>
      p.competition.status === 'running' &&
      p.standings?.some((row) => row.player.id === me),
  )
  const preferred = slug ?? nextGame(pages, me)?.slug
  const page =
    candidates.find((p) => p.competition.slug === preferred) ?? candidates[0]
  if (!page?.standings) return null
  const index = page.standings.findIndex((row) => row.player.id === me)
  return {
    competition: page.competition.name,
    slug: page.competition.slug,
    place: index + 1,
    of: page.standings.length,
    points: page.standings[index].points,
  }
}

/** "2d 4h left", "3h left", "40m left" or "Deadline passed". */
export function timeLeft(dueAt: number, now = Date.now()): string {
  const minutes = Math.floor((dueAt - now) / 60_000)
  if (minutes <= 0) return 'Deadline passed'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days) return `${days}d ${hours}h left`
  return hours ? `${hours}h left` : `${minutes}m left`
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}
