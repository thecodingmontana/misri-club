/**
 * A competition's time control, as chess.com names it: "any", a speed
 * ("blitz"), or an exact clock from the presets ("180+2" = 3 min + 2 s,
 * "1/86400" = 1 day per move). Only games that fit count as results.
 */

export const SPEEDS = ['bullet', 'blitz', 'rapid', 'daily'] as const
export type Speed = (typeof SPEEDS)[number]

export const PRESETS: Record<Speed, string[]> = {
  bullet: ['60', '60+1', '120+1'],
  blitz: ['180', '180+2', '300', '300+3'],
  rapid: ['600', '600+5', '900+10', '1800'],
  daily: ['1/86400', '1/259200'],
}

const SPEED_LABEL: Record<Speed, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  daily: 'Daily',
}

export function isTimeControl(value: string): boolean {
  return value === 'any' || speedOf(value) !== null
}

/** The speed a value belongs to, or null for "any" and unknown values. */
export function speedOf(value: string): Speed | null {
  if ((SPEEDS as readonly string[]).includes(value)) return value as Speed
  return SPEEDS.find((speed) => PRESETS[speed].includes(value)) ?? null
}

/** "3+2", "10 min", "1 day per move" */
export function clockLabel(preset: string): string {
  if (preset.startsWith('1/')) {
    const days = Number(preset.slice(2)) / 86400
    return `${days} day${days === 1 ? '' : 's'} per move`
  }
  const [base, increment] = preset.split('+').map(Number)
  const minutes = base / 60
  return increment ? `${minutes}+${increment}` : `${minutes} min`
}

/** "Any time control", "Blitz (any clock)", "Blitz 3+2" */
export function timeControlLabel(value: string): string {
  const speed = speedOf(value)
  if (!speed) return 'Any time control'
  if (value === speed) return `${SPEED_LABEL[speed]} (any clock)`
  return `${SPEED_LABEL[speed]} ${clockLabel(value)}`
}

export const speedLabel = (speed: Speed) => SPEED_LABEL[speed]

/** Does a chess.com game fit the competition's time control? */
export function fitsTimeControl(
  rule: string,
  game: { time_class?: string; time_control?: string },
): boolean {
  if (rule === 'any') return true
  if ((SPEEDS as readonly string[]).includes(rule))
    return game.time_class === rule
  return game.time_control === rule
}
