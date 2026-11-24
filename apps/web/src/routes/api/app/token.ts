import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { redeemAppCode } from '#/server/app-sign-in.server'

const body = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  // PKCE verifier: 43 to 128 unreserved characters
  verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
})

/** The Misri app trades its one-time code (and PKCE verifier) for a session token. */
export const Route = createFileRoute('/api/app/token')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = body.safeParse(await request.json().catch(() => null))
        const token = parsed.success
          ? await redeemAppCode(parsed.data.code, parsed.data.verifier)
          : null
        if (!token) {
          return Response.json(
            { error: 'That sign-in has expired. Try again.' },
            { status: 400, headers: { 'Cache-Control': 'no-store' } },
          )
        }
        return Response.json(
          { token },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      },
    },
  },
})
