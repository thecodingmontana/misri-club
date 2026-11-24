// The web preview only: passkeys need the phone's credential manager.
export async function signInWithPasskey(): Promise<string | null> {
  return 'Passkeys work in the Android app.'
}
