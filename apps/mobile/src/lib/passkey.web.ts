// The web preview only: passkeys need the phone's credential manager.
export function usePasskeys() {
  return { usable: false, giveUp: () => {} }
}

export async function signInWithPasskey(): Promise<string | null> {
  return 'unavailable'
}
