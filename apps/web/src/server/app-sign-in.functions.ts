import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { issueAppCode } from './app-sign-in.server'
import { userMiddleware } from './auth.functions'

/** PKCE S256 challenge: 43 base64url characters. */
export const appChallenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

/** The player agreed to sign in to the app: a code for its link back. */
export const issueAppCodeFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ challenge: appChallenge }))
  .handler(({ context, data }) => issueAppCode(context.user.id, data.challenge))
