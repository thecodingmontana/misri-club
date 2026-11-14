/**
 * Competition names: the key that makes them unique, and chess-themed
 * suggestions for when a name is taken or the field is empty.
 */

const FLAVOURS = [
  'Rapid',
  'Blitz',
  'Midnight',
  'Sunday',
  'Golden',
  'Royal',
  'Iron',
  'Silent',
  'Friday',
  'Bullet',
  'Silver',
  'Northern',
]

const PIECES = [
  'Knights',
  'Rooks',
  'Bishops',
  'Queens',
  'Pawns',
  'Gambit',
  'Castle',
  'Checkmate',
  'Endgame',
  'Zugzwang',
  'Fianchetto',
  'Opening',
]

const TYPES = ['Cup', 'League', 'Open', 'Classic', 'Challenge', 'Series']

/** Trimmed, lower-cased, inner whitespace collapsed: what must be unique. */
export function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** mulberry32: a tiny seeded generator so suggestions can be reproduced. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(list: T[], next: () => number) =>
  list[Math.floor(next() * list.length)] as T

/**
 * Up to `count` distinct names like "Midnight Rooks Cup", none of them in
 * `taken` (normalized keys).
 */
export function suggestNames(
  count: number,
  taken: Set<string>,
  seed = Date.now(),
  flavours: string[] = FLAVOURS,
): string[] {
  const next = random(seed)
  const seen = new Set(taken)
  const names: string[] = []
  // ≥12 × 12 × 6 combinations, so a bounded number of tries finds `count`.
  for (let tries = 0; names.length < count && tries < count * 50; tries++) {
    const name = `${pick(flavours, next)} ${pick(PIECES, next)} ${pick(TYPES, next)}`
    const key = normalizeName(name)
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

/**
 * Names close to `name` (a flavour word before its last word, or a type
 * added), then generic suggestions; `count` in all, none in `taken`.
 */
export function suggestFrom(
  name: string,
  count: number,
  taken: Set<string>,
  seed = Date.now(),
  extraFlavours: string[] = [],
): string[] {
  const words = name.trim().split(/\s+/)
  const last = words.at(-1) ?? ''
  const head = words.slice(0, -1).join(' ')
  const endsInType = TYPES.some(
    (type) => normalizeName(type) === last.toLowerCase(),
  )
  const next = random(seed)
  const flavours = [...extraFlavours, ...FLAVOURS].sort(() => next() - 0.5)
  const candidates = endsInType
    ? flavours.map((f) => [head, f, last].filter(Boolean).join(' '))
    : [
        ...TYPES.map((type) => `${name.trim()} ${type}`),
        ...flavours.map((f) => `${f} ${name.trim()}`),
      ]
  const seen = new Set(taken)
  const names: string[] = []
  for (const candidate of candidates) {
    if (names.length === count) break
    const key = normalizeName(candidate)
    // keep within the 60-character limit on names
    if (seen.has(key) || candidate.length > 60) continue
    seen.add(key)
    names.push(candidate)
  }
  return [
    ...names,
    ...suggestNames(count - names.length, seen, seed, [
      ...extraFlavours,
      ...FLAVOURS,
    ]),
  ]
}
