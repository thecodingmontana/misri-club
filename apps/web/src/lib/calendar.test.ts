import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fold, icsCalendar } from './calendar.ts'

const event = {
  uid: 'm1@misri',
  start: new Date('2026-12-01T17:00:00Z'),
  end: new Date('2026-12-01T18:00:00Z'),
  summary: 'Due: vs bob, Winter League; round 2',
  url: 'https://example.com/c/winter',
  alarmMinutes: 1440,
}

test('a calendar with one event, CRLF lines, UTC times, escaped text', () => {
  const ics = icsCalendar(
    'Misri matches',
    [event],
    new Date('2026-11-22T00:00:00Z'),
  )
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'))
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends in CRLF')
  assert.ok(ics.includes('DTSTART:20261201T170000Z'))
  assert.ok(ics.includes('DTSTAMP:20261122T000000Z'))
  assert.ok(ics.includes('SUMMARY:Due: vs bob\\, Winter League\\; round 2'))
  assert.ok(ics.includes('TRIGGER:-PT1440M'))
})

test('an empty calendar is still valid', () => {
  const ics = icsCalendar('Misri matches', [])
  assert.ok(ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR'))
  assert.ok(!ics.includes('BEGIN:VEVENT'))
})

test('long lines fold at 75 bytes, multi-byte characters kept whole', () => {
  const long = `SUMMARY:${'é'.repeat(60)}`
  const folded = fold(long)
  const lines = folded.split('\r\n')
  assert.ok(lines.length > 1)
  for (const line of lines) {
    assert.ok(new TextEncoder().encode(line).length <= 75)
  }
  assert.equal(lines.map((l, i) => (i ? l.slice(1) : l)).join(''), long)
})
