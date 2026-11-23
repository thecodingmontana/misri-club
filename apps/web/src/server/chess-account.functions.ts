import { chessAccount } from '@misri/core/account'
import { actions } from '@misri/core/actions'
import { createServerFn } from '@tanstack/react-start'
import { apiClient, perform } from './api-client.server'
import { userMiddleware } from './auth.functions'

/** Your linked chess.com account, or the code you are verifying, or nothing. */
export const getChessAccountFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(
    ({ context }) =>
      apiClient()?.chessAccount() ?? chessAccount(context.user.id),
  )

/** Step 1: name your chess.com account and get a code to put in your profile. */
export const startChessVerificationFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.startChessVerification.input)
  .handler(({ context, data }) =>
    perform('startChessVerification', context.viewer, data),
  )

/** Step 2: we read your public profile and, if the code is there, link it. */
export const checkChessVerificationFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(({ context }) =>
    perform('checkChessVerification', context.viewer, {}),
  )
