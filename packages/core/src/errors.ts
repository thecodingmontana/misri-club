/**
 * A message written for the person using the app ("It's full."). The API
 * passes these through; any other error is masked as an internal one.
 */
export class UserError extends Error {}
