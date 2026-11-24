import { Passkey } from 'react-native-passkey'
import { authClient } from './auth'
import { SITE_URL } from './config'

/**
 * Sign in with a passkey saved for misri-chess-club.vercel.app (the same ones
 * the website uses): the server's challenge, the phone's passkey prompt, then
 * the server checks the answer and starts the session.
 * Returns null when signed in, 'cancelled', or an error sentence.
 */
export async function signInWithPasskey(): Promise<string | null> {
  if (!Passkey.isSupported()) {
    return "This phone can't use passkeys. Use Google or your email instead."
  }
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
