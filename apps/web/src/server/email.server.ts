import { render } from '@react-email/components'
import type { ReactElement } from 'react'
import { Resend } from 'resend'

// Without a key (local setups, tests) emails are skipped, not sent.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

/** Sends one email; false instead of throwing, so the caller decides what a failure means. */
export async function sendEmail(
  to: string,
  subject: string,
  react: ReactElement,
): Promise<boolean> {
  const from = process.env.EMAIL_FROM
  if (!resend || !from) return false
  try {
    const [html, text] = await Promise.all([
      render(react),
      render(react, { plainText: true }),
    ])
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    })
    if (error) throw new Error(error.message)
    return true
  } catch (error) {
    console.error(`[email] "${subject}" failed:`, (error as Error).message)
    return false
  }
}
