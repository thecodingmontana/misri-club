import { createAuth } from '@misri/auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { createElement } from 'react'
import MagicLinkEmail from '#/emails/magic-link'
import { SITE_NAME, SITE_URL } from '#/lib/seo'
import { sendEmail } from './email.server'

// The shared setup (packages/auth); this app signs people in, so it sends the
// emails, guards account deletion and keeps TanStack's cookie handling.
export { googleEnabled } from '@misri/auth'
// shared with the API, so both decide admins the same way
export { isAdminEmail } from '@misri/core/admin'

export const auth = createAuth({
  sendMagicLink: (email, url, minutes) =>
    sendEmail(
      email,
      `Your ${SITE_NAME} sign-in link`,
      createElement(MagicLinkEmail, {
        link: url,
        baseUrl: SITE_URL || new URL(url).origin,
        minutes,
      }),
    ),
  beforeDeleteUser: async (user) => {
    // lazy: membership.server imports this module
    const { refuseIfOwner } = await import('./membership.server')
    await refuseIfOwner(user.id)
  },
  plugins: [tanstackStartCookies()], // must stay last
})
