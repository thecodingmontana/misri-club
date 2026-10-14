import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  isAdmin,
  isAuthConfigured,
  requireAdmin,
  signIn,
  signOut,
} from './auth.server'

/**
 * The security boundary for every mutating server function.
 *
 * Server functions are ordinary HTTP endpoints — reachable whether or not the
 * page that calls them was ever loaded. Hiding a button in the UI is presentation;
 * this middleware is the thing that actually stops an unauthenticated caller.
 */
export const adminMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    requireAdmin()
    return next()
  },
)

export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => ({
    isAdmin: isAdmin(),
    configured: isAuthConfigured(),
  }),
)

export const loginFn = createServerFn({ method: 'POST' })
  .validator(z.object({ password: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    await signIn(data.password)
    return { ok: true as const }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  signOut()
  return { ok: true as const }
})
