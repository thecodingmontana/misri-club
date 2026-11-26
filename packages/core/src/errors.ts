/**
 * A message written for the person using the app ("It's full."). The API
 * passes these through; any other error is masked as an internal one.
 */
export class UserError extends Error {}

/** The API's error code for a TryLater, so its client can tell. */
export const TRY_LATER = 'TRY_LATER'

/** A limit reached for now ("Too many tries"): the same request works later. */
export class TryLater extends UserError {}
