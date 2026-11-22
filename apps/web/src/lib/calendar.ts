/**
 * An iCalendar (.ics) feed: calendar apps subscribe to it and remind the
 * player natively. Kept to what every app reads (RFC 5545).
 */

export interface CalendarEvent {
  uid: string
  start: Date
  end: Date
  summary: string
  description?: string
  url?: string
  /** minutes before `start` to remind */
  alarmMinutes?: number
}

const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

const escape = (text: string) =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')

/** Lines longer than 75 bytes continue on the next line after a space. */
export function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // continuation lines start with a space, which counts toward their 75
    const limit = parts.length === 0 ? 75 : 74
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function icsCalendar(
  name: string,
  events: CalendarEvent[],
  now = new Date(),
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Misri//Match deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
  ]
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(event.start)}`,
      `DTEND:${stamp(event.end)}`,
      `SUMMARY:${escape(event.summary)}`,
    )
    if (event.description) {
      lines.push(`DESCRIPTION:${escape(event.description)}`)
    }
    if (event.url) lines.push(`URL:${event.url}`)
    if (event.alarmMinutes) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escape(event.summary)}`,
        `TRIGGER:-PT${event.alarmMinutes}M`,
        'END:VALARM',
      )
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}
