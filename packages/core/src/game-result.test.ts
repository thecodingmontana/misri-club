import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  archiveMonths,
  type ChessGame,
  findMatchResult,
} from './game-result.ts'

const window = {
  home: 'Alice',
  away: 'bob',
  opensAt: new Date('2026-11-10T00:00:00Z'),
  dueAt: new Date('2026-11-12T00:00:00Z'),
}
const at = (iso: string) => Date.parse(iso) / 1000
const game = (
  white: string,
  wr: string,
  black: string,
  br: string,
  end: string,
  url = `https://www.chess.com/game/live/${end}`,
): ChessGame => ({
  url,
  end_time: at(end),
  white: { username: white, result: wr },
  black: { username: black, result: br },
})

test('a win by the away player as white', () => {
  const found = findMatchResult(
    [game('bob', 'win', 'alice', 'checkmated', '2026-11-11T10:00:00Z')],
    window,
  )
  assert.equal(found?.result, 'white')
  assert.equal(found?.homeWasWhite, false)
})

test('draw codes count as a draw', () => {
  const found = findMatchResult(
    [game('alice', 'repetition', 'bob', 'repetition', '2026-11-11T10:00:00Z')],
    window,
  )
  assert.equal(found?.result, 'draw')
  assert.equal(found?.homeWasWhite, true)
})

test('games outside the window, against others, or aborted do not count', () => {
  const found = findMatchResult(
    [
      game('alice', 'win', 'bob', 'resigned', '2026-11-09T23:59:59Z'),
      game('alice', 'win', 'carol', 'resigned', '2026-11-11T09:00:00Z'),
      game('alice', 'abandoned', 'bob', 'abandoned', '2026-11-11T09:30:00Z'),
    ],
    window,
  )
  assert.equal(found, null)
})

test('a game ending exactly at the opening or the deadline counts', () => {
  for (const end of ['2026-11-10T00:00:00Z', '2026-11-12T00:00:00Z']) {
    const found = findMatchResult(
      [game('alice', 'win', 'bob', 'resigned', end)],
      window,
    )
    assert.equal(found?.result, 'white', end)
  }
  assert.equal(
    findMatchResult(
      [game('alice', 'win', 'bob', 'resigned', '2026-11-12T00:00:01Z')],
      window,
    ),
    null,
    'a second after the deadline',
  )
})

test('the first finished game in the window counts', () => {
  const found = findMatchResult(
    [
      game('alice', 'resigned', 'bob', 'win', '2026-11-11T12:00:00Z', 'second'),
      game('alice', 'win', 'bob', 'timeout', '2026-11-11T08:00:00Z', 'first'),
    ],
    window,
  )
  assert.equal(found?.gameUrl, 'first')
  assert.equal(found?.result, 'white')
})

test('archiveMonths spans a window across a month boundary', () => {
  assert.deepEqual(
    archiveMonths(
      new Date('2026-11-28T00:00:00Z'),
      new Date('2026-12-02T00:00:00Z'),
    ),
    ['2026/11', '2026/12'],
  )
})

test('only games in the competition time control count, never variants', () => {
  const rapid = {
    ...game('alice', 'win', 'bob', 'resigned', '2026-11-11T09:00:00Z'),
    time_class: 'rapid',
    time_control: '600',
  }
  const blitz = {
    ...game('bob', 'win', 'alice', 'timeout', '2026-11-11T10:00:00Z'),
    time_class: 'blitz',
    time_control: '180+2',
  }
  const chess960 = {
    ...game('alice', 'win', 'bob', 'resigned', '2026-11-11T08:00:00Z'),
    rules: 'chess960',
  }
  const games = [chess960, rapid, blitz]
  assert.equal(findMatchResult(games, window)?.result, 'white') // the rapid game
  assert.equal(findMatchResult(games, window)?.homeWasWhite, true)
  const blitzOnly = findMatchResult(games, { ...window, timeControl: 'blitz' })
  assert.equal(blitzOnly?.homeWasWhite, false)
  assert.equal(findMatchResult(games, { ...window, timeControl: '300' }), null)
})

test('a game already counted for another match is skipped', () => {
  const first = game('alice', 'win', 'bob', 'resigned', '2026-11-11T09:00:00Z')
  const second = game('bob', 'win', 'alice', 'resigned', '2026-11-11T10:00:00Z')
  const found = findMatchResult([first, second], window, new Set([first.url]))
  assert.equal(found?.gameUrl, second.url)
  assert.equal(found?.homeWasWhite, false)
})
