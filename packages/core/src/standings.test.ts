import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fitsMatch,
  POINTS,
  rankStandings,
  type ScoredMatch,
  tallyStandings,
} from './standings.ts'

const now = new Date('2026-10-12T12:00:00Z')
const past = new Date('2026-10-10T12:00:00Z')
const future = new Date('2026-10-14T12:00:00Z')
const bothForfeitRules = { unplayed: 'both_forfeit', points: POINTS } as const

const match = (extra: Partial<ScoredMatch> = {}): ScoredMatch => ({
  homeUserId: 'a',
  awayUserId: 'b',
  dueAt: past,
  result: null,
  whiteUserId: null,
  winnerUserId: null,
  voided: false,
  ...extra,
})

test('a called-off match counts for nobody, even with a result on it', () => {
  const tally = tallyStandings(
    [match({ whiteUserId: 'a', result: 'white', voided: true })],
    ['a', 'b'],
    now,
    bothForfeitRules,
  )
  assert.equal(tally.get('a')?.points, 0)
  assert.equal(tally.get('b')?.forfeits, 0)
})

test('a win scores for whoever had the winning colour, home or away', () => {
  const tally = tallyStandings(
    [match({ whiteUserId: 'b', result: 'white' })],
    ['a', 'b'],
    now,
  )
  assert.equal(tally.get('b')?.points, POINTS.win)
  assert.equal(tally.get('b')?.wins, 1)
  assert.equal(tally.get('a')?.losses, 1)
  assert.equal(tally.get('a')?.points, POINTS.loss)
})

test('a draw gives both players a point', () => {
  const tally = tallyStandings(
    [match({ whiteUserId: 'a', result: 'draw' })],
    ['a', 'b'],
    now,
  )
  assert.equal(tally.get('a')?.points, POINTS.draw)
  assert.equal(tally.get('b')?.points, POINTS.draw)
})

const bothForfeit = { unplayed: 'both_forfeit', points: POINTS } as const

test('an unplayed match waits for the organiser by default', () => {
  const closed = tallyStandings([match()], ['a', 'b'], now)
  assert.equal(closed.get('a')?.points, 0)
  assert.equal(closed.get('a')?.forfeits, 0)
})

test('"no result" leaves an unplayed match out of the table', () => {
  const rules = { unplayed: 'void', points: POINTS } as const
  const closed = tallyStandings([match()], ['a', 'b'], now, rules)
  assert.equal(closed.get('b')?.points, 0)
})

test('the organiser sets what each outcome is worth', () => {
  const points = { win: 2, draw: 1, loss: 0, forfeit: -3 }
  const tally = tallyStandings(
    [match({ dueAt: future, winnerUserId: 'b' })],
    ['a', 'b'],
    now,
    { unplayed: 'organiser', points },
  )
  assert.equal(tally.get('b')?.points, 2)
  assert.equal(tally.get('a')?.points, -3)
})

test('"both lose it" costs both only once its window closes', () => {
  const open = tallyStandings(
    [match({ dueAt: future })],
    ['a', 'b'],
    now,
    bothForfeit,
  )
  assert.equal(open.get('a')?.points, 0)

  const closed = tallyStandings([match()], ['a', 'b'], now, bothForfeit)
  assert.equal(closed.get('a')?.points, POINTS.forfeit)
  assert.equal(closed.get('b')?.points, POINTS.forfeit)
  assert.equal(closed.get('b')?.forfeits, 1)
})

test('a walkover gives the winner 3 and the other -1, even before the deadline', () => {
  const tally = tallyStandings(
    [match({ dueAt: future, winnerUserId: 'b' })],
    ['a', 'b'],
    now,
  )
  assert.deepEqual(tally.get('b'), {
    points: 3,
    wins: 1,
    draws: 0,
    losses: 0,
    forfeits: 0,
  })
  assert.deepEqual(tally.get('a'), {
    points: -1,
    wins: 0,
    draws: 0,
    losses: 0,
    forfeits: 1,
  })
})

test('a played game overrides a walkover', () => {
  const tally = tallyStandings(
    [match({ winnerUserId: 'b', whiteUserId: 'a', result: 'white' })],
    ['a', 'b'],
    now,
  )
  assert.equal(tally.get('a')?.points, POINTS.win)
  assert.equal(tally.get('b')?.forfeits, 0)
})

test('an expired match against a player who left costs nobody', () => {
  const tally = tallyStandings([match()], ['a'], now)
  assert.equal(tally.get('a')?.points, 0)
  assert.equal(tally.get('a')?.forfeits, 0)
})

test('byes score nothing', () => {
  const tally = tallyStandings(
    [match({ homeUserId: null, awayUserId: null })],
    ['a', 'b'],
    now,
  )
  assert.equal(tally.get('a')?.points, 0)
  assert.equal(tally.get('b')?.points, 0)
})

test('a game fits its match only between the same pair, inside the window', () => {
  const window = { homeUserId: 'a', awayUserId: 'b', opensAt: past, dueAt: now }
  const game = (whiteUserId: string, blackUserId: string, endedAt: Date) => ({
    whiteUserId,
    blackUserId,
    endedAt,
  })

  assert.ok(fitsMatch(game('a', 'b', past), window), 'opening instant counts')
  assert.ok(
    fitsMatch(game('b', 'a', now), window),
    'either colour, deadline counts',
  )
  assert.ok(!fitsMatch(game('a', 'b', future), window), 'after the deadline')
  assert.ok(
    !fitsMatch(game('a', 'b', new Date(past.getTime() - 1)), window),
    'before the window opens',
  )
  assert.ok(!fitsMatch(game('a', 'c', now), window), 'different opponent')
})

test('ties on points break in the organiser order, name last', () => {
  // a beat b; c beat d; a and c both on 3 points, c with a forfeit-free record
  const games = [
    match({ whiteUserId: 'a', result: 'white' }),
    match({
      homeUserId: 'c',
      awayUserId: 'd',
      whiteUserId: 'c',
      result: 'white',
    }),
  ]
  const ids = ['a', 'b', 'c', 'd']
  const order = (tieBreaks: Parameters<typeof rankStandings>[4]) =>
    rankStandings(
      games,
      ids,
      now,
      { unplayed: 'organiser', points: POINTS },
      tieBreaks,
      (id) => id,
    ).map((r) => r.id)
  // level on everything: name decides
  assert.deepEqual(order(['wins', 'forfeits', 'headToHead']).slice(0, 2), [
    'a',
    'c',
  ])
})

test('head-to-head puts the winner of the game between them first', () => {
  const games = [
    match({
      homeUserId: 'z',
      awayUserId: 'y',
      whiteUserId: 'z',
      result: 'black',
    }), // y beat z
    match({
      homeUserId: 'z',
      awayUserId: 'x',
      whiteUserId: 'z',
      result: 'white',
    }), // z beat x
    match({
      homeUserId: 'y',
      awayUserId: 'x',
      whiteUserId: 'y',
      result: 'black',
    }), // x beat y
  ]
  const rules = { unplayed: 'organiser', points: POINTS } as const
  // all on 3 points and 1 win: by name x, y, z; head-to-head first: still pairwise
  const named = rankStandings(
    games,
    ['x', 'y', 'z'],
    now,
    rules,
    ['wins'],
    (id) => id,
  )
  assert.deepEqual(
    named.map((r) => r.id),
    ['x', 'y', 'z'],
  )
  const two = [
    match({
      homeUserId: 'q',
      awayUserId: 'p',
      whiteUserId: 'q',
      result: 'white',
    }),
    match({
      homeUserId: 'p',
      awayUserId: 'r',
      whiteUserId: 'p',
      result: 'white',
    }),
    match({
      homeUserId: 'q',
      awayUserId: 'r',
      whiteUserId: 'r',
      result: 'white',
    }),
  ]
  // p and q both 3 points; q beat p, so head-to-head puts q above p despite the name
  const h2h = rankStandings(
    two,
    ['p', 'q', 'r'],
    now,
    rules,
    ['headToHead', 'wins', 'forfeits'],
    (id) => id,
  )
  assert.equal(
    h2h.findIndex((r) => r.id === 'q') < h2h.findIndex((r) => r.id === 'p'),
    true,
  )
})
