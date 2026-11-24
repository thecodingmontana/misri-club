/** Actions a player can take offline; they're sent once the device is back. */
export const QUEUEABLE = [
  'reportResult',
  'answerReport',
  'concedeMatch',
  'answerRequest',
] as const

export type Queueable = (typeof QUEUEABLE)[number]

/** How each reads in a toast. */
export const QUEUED_LABEL: Record<Queueable, string> = {
  reportResult: 'Your result report',
  answerReport: 'Your answer to the result report',
  concedeMatch: 'Your walkover',
  answerRequest: 'Your answer to the join request',
}
