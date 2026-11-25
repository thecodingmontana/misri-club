// The web preview only: passkeys need the phone's credential manager.
export function usePasskeys() {
  return { usable: false, giveUp: () => {} }
}

export async function signInWithPasskey(): Promise<string | null> {
  return 'unavailable'
}

export type SavedPasskey = {
  id: string
  name?: string | null
  createdAt: string
}
export async function addPasskey(): Promise<string | null> {
  return 'unavailable'
}
export async function listPasskeys(): Promise<SavedPasskey[]> {
  return []
}
export async function removePasskey(_id: string) {}
