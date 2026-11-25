import { useEffect, useState } from 'react'
import { Passkey } from 'react-native-passkey'
import { authClient } from './auth'
import { SITE_URL } from './config'
import * as SecureStore from './storage'

// Set once a passkey prompt fails for a reason other than the player: from
// then on this phone doesn't offer passkeys, and Google or email take over.
const BROKEN_KEY = 'misri.passkeys-broken'

/** Whether to offer passkeys here: the phone supports them and they've worked. */
export function usePasskeys() {
  const [usable, setUsable] = useState(false)
  useEffect(() => {
    if (!Passkey.isSupported()) return
    SecureStore.getItemAsync(BROKEN_KEY)
      .then((broken) => setUsable(broken !== '1'))
      .catch(() => setUsable(true))
  }, [])
  return { usable, giveUp: () => setUsable(false) }
}

/**
 * Sign in with a passkey saved for misri-chess-club.vercel.app (the same ones
 * the website uses): the server's challenge, the phone's passkey prompt, then
 * the server checks the answer and starts the session.
 * Returns null when signed in, 'cancelled', 'unavailable' (this phone can't
 * do it; stop offering it), or an error sentence.
 */
export async function signInWithPasskey(): Promise<string | null> {
  if (!Passkey.isSupported()) return 'unavailable'
  const { data: options, error } = await authClient.$fetch<
    Parameters<typeof Passkey.get>[0]
  >('/passkey/generate-authenticate-options', { method: 'GET' })
  if (error || !options) return error?.message || "Couldn't start. Try again."
  let response: Awaited<ReturnType<typeof Passkey.get>>
  try {
    response = await Passkey.get({
      ...options,
      rpId: options.rpId || new URL(SITE_URL).hostname,
    })
  } catch (cause) {
    const text = String((cause as { error?: string })?.error ?? cause)
    return /cancel/i.test(text)
      ? 'cancelled'
      : 'No passkey was used. Try again.'
  }
  const verified = await authClient.$fetch('/passkey/verify-authentication', {
    method: 'POST',
    body: {
      response: {
        ...response,
        rawId: response.rawId ?? response.id,
        type: response.type ?? 'public-key',
        clientExtensionResults: response.clientExtensionResults ?? {},
      },
    },
  })
  return verified.error
    ? verified.error.message || "That passkey didn't work. Try again."
    : null
}
