/**
 * The words for each competition format and status, shared by the website and
 * the app so the two never say different things.
 */

import type { EarlyRounds } from './early-rounds'
import type { LeaveRule } from './leave'
import type { Points, TieBreak, UnplayedRule } from './standings'

export const FORMAT_LABEL = {
  league: 'League',
  knockout: 'Tournament',
  challenge: '1v1 challenge',
  groups: 'Groups + knockout',
}

/** What each format is, in plain words, wherever people choose or join one. */
export const FORMAT_INFO = {
  league: {
    summary: 'Everyone plays everyone. Most points wins.',
    points: [
      'Every player meets every other player, once or home & away.',
      'Each result earns points; the table ranks everyone.',
      'Top of the table at the end wins.',
      'Can take new players after it starts, if the organiser allows it.',
    ],
  },
  knockout: {
    summary: "Knockout rounds. Lose once and you're out.",
    points: [
      'Players are paired up; the winner of each game goes through.',
      'Each round halves the field until the final.',
      'One game per tie, or home & away on aggregate with a decider if level.',
      'Closed to new players once it starts.',
    ],
  },
  challenge: {
    summary: 'You against one player, best of 1, 3, 5 or 7.',
    points: [
      'Send your opponent the link; it starts when they join.',
      'Play every game before the deadline.',
      'A win is a point, a draw half. First out of reach wins.',
      'Level after every game is a drawn match.',
    ],
  },
  groups: {
    summary: 'Group tables first, then a knockout of the best.',
    points: [
      'Players are drawn into groups, top seeds spread out.',
      'Everyone in a group plays everyone; each group has a table.',
      'The top of every group goes into a knockout bracket.',
      'Group-mates are kept apart in the first knockout round.',
    ],
  },
} as const

export const STATUS_LABEL = {
  open: 'Taking players',
  running: 'Under way',
  finished: 'Finished',
}

/** Every way to start a competition, for the start page and home. */
export const CREATE_CHOICES = [
  {
    format: 'league',
    title: 'Create a league',
    description: FORMAT_INFO.league.summary,
  },
  {
    format: 'knockout',
    title: 'Create a tournament',
    description: FORMAT_INFO.knockout.summary,
  },
  {
    format: 'challenge',
    title: 'Challenge a player',
    description: FORMAT_INFO.challenge.summary,
  },
  {
    format: 'groups',
    title: 'Create groups + knockout',
    description: FORMAT_INFO.groups.summary,
  },
] as const

export const POINT_LABEL: Record<keyof Points, string> = {
  win: 'Win',
  draw: 'Draw',
  loss: 'Loss',
  forfeit: 'Forfeit',
}
export const POINT_KEYS = Object.keys(POINT_LABEL) as Array<keyof Points>

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

/** One line anyone can read: how unplayed matches go and what results are worth. */
export function scoringSummary(
  format: 'league' | 'knockout' | 'challenge' | 'groups',
  unplayedRule: UnplayedRule,
  points: Points,
) {
  if (format !== 'league') return 'Unplayed matches: the organiser decides'
  const rule = {
    organiser: 'the organiser decides',
    both_forfeit: 'both lose it',
    void: 'no result',
  }[unplayedRule]
  const worth = POINT_KEYS.map(
    (key) => `${POINT_LABEL[key]} ${signed(points[key])}`,
  ).join(' · ')
  return `Unplayed matches: ${rule} · ${worth}`
}

export const UNPLAYED_LABEL: Record<UnplayedRule, string> = {
  organiser: 'I decide',
  both_forfeit: 'Both lose it',
  void: 'No result',
}

export const UNPLAYED_HELP: Record<UnplayedRule, string> = {
  organiser:
    'It waits for you: award a walkover to whoever turned up, or call it off.',
  both_forfeit: 'Both players take the forfeit points.',
  void: "It doesn't count for anyone.",
}

export const LEAVE_LABEL: Record<LeaveRule, string> = {
  award: 'Award their games',
  void: 'Wipe their games',
  keep: 'Keep results',
}

/** What leaving does, in the words the leaver and organiser both read. */
export const LEAVE_HELP: Record<LeaveRule, string> = {
  award:
    'Their unplayed games go to the opponents as wins; they take the forfeits and drop off the table.',
  void: 'All their games are removed, played ones too, as if they never entered.',
  keep: 'Games already played still count; the rest are called off.',
}

export const EARLY_LABEL: Record<EarlyRounds, string> = {
  organiser: 'Let me decide',
  auto: 'Open the next round',
  wait: 'Wait for its date',
}

export const EARLY_HELP: Record<EarlyRounds, string> = {
  organiser:
    'When everyone has played, you get a button to open the next round.',
  auto: 'The next round opens by itself as soon as everyone has played.',
  wait: 'Each round opens on its scheduled date.',
}

export const TIE_LABEL: Record<TieBreak, string> = {
  wins: 'More wins',
  forfeits: 'Fewer forfeits',
  headToHead: 'Head-to-head',
}
