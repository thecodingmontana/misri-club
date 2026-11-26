import { ApiError } from '@misri/api-client'
import { TryLater, UserError } from '@misri/core/errors'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { QUEUEABLE } from '#/lib/sync/queueable'
import { perform } from './api-client.server'
import { userMiddleware } from './auth.functions'

/**
 * Runs an action a player took offline, now that their device is back.
 * `refused` carries the reason when it can never succeed (the result was
 * already settled, the match is over…); any other failure throws, and the
 * device tries again later.
 */
export const runQueuedActionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ name: z.enum(QUEUEABLE), input: z.unknown() }))
  .handler(async ({ context, data }) => {
    try {
      // the action validates its own input
      await perform(data.name, context.viewer, data.input as never)
      return { refused: null }
    } catch (error) {
      // a limit for now: the device keeps it and tries again later
      if (error instanceof TryLater) throw error
      if (
        error instanceof UserError ||
        (error instanceof ApiError && error.refused)
      ) {
        // the dead letter: what was dropped, for whom, and why
        console.warn('Queued action refused', {
          userId: context.viewer.id,
          action: data.name,
          reason: error.message,
        })
        return { refused: error.message }
      }
      throw error
    }
  })
