import { actions } from '@misri/core/actions'
import { createServerFn } from '@tanstack/react-start'
import { perform } from './api-client.server'
import { userMiddleware } from './auth.functions'
import { pushPublicKey } from './push.server'

/** The VAPID public key browsers subscribe with; null when push isn't set up. */
export const getPushKeyFn = createServerFn({ method: 'GET' }).handler(() =>
  pushPublicKey(),
)

/** Remembers this device for the signed-in player (re-saving is harmless). */
export const savePushFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.savePush.input)
  .handler(({ context, data }) => perform('savePush', context.viewer, data))

export const removePushFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.removePush.input)
  .handler(({ context, data }) => perform('removePush', context.viewer, data))

/** A test notification to every device of the signed-in player. */
export const testPushFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(({ context }) => perform('testPush', context.viewer, {}))
