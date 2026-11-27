/** A failed request read as what it means for the player: no connection. */
export function readable(message: string) {
  return /fetch failed|network request failed|unknownhost|unable to resolve host|failed to connect|timed? ?out|aborted/i.test(
    message,
  )
    ? "You're offline. Connect to the internet and try again."
    : message
}
