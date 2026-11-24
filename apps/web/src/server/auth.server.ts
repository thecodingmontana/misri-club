import { createAuth } from '@misri/auth'
import { APIError } from 'better-auth/api'
import { jwt } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { createElement } from 'react'
import MagicLinkEmail from '#/emails/magic-link'
import SignInCodeEmail from '#/emails/sign-in-code'
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
  sendSignInCode: (email, code, minutes) =>
    sendEmail(
      email,
      `${code} is your ${SITE_NAME} sign-in code`,
      createElement(SignInCodeEmail, {
        code,
        baseUrl: SITE_URL || 'https://misri-chess-club.vercel.app',
        minutes,
      }),
    ),
  beforeDeleteUser: async (user) => {
    // lazy: membership.server imports this module
    const { prepareAccountDeletion } = await import('./membership.server')
    // Better Auth shows its own errors' messages to the person deleting
    await prepareAccountDeletion(user.id).catch((error: Error) => {
      throw new APIError('BAD_REQUEST', { message: error.message })
    })
  },
  plugins: [
    // tokens for PowerSync (local-first sync): only the user id, for 15
    // minutes, for this one audience; the app fetches one at /api/auth/token
    ...(process.env.POWERSYNC_URL
      ? [
          jwt({
            // RS256: the algorithm every JWT verifier (PowerSync included) accepts
            jwks: { keyPairConfig: { alg: 'RS256', modulusLength: 2048 } },
            jwt: {
              audience: process.env.POWERSYNC_URL,
              expirationTime: '15m',
              definePayload: () => ({}),
            },
            // only /api/auth/token hands one out, not every session check
            disableSettingJwtHeader: true,
          }),
        ]
      : []),
    tanstackStartCookies(), // must stay last
  ],
})
