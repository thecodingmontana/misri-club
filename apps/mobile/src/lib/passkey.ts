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

/**
 * Save a new passkey for this account on this phone: the server's options,
 * the phone's create prompt, then the server stores it. Returns null when
 * saved, 'cancelled', 'unavailable', or an error sentence.
 */
export async function addPasskey(): Promise<string | null> {
  if (!Passkey.isSupported()) return 'unavailable'
  const { data: options, error } = await authClient.$fetch<
    Parameters<typeof Passkey.create>[0]
  >('/passkey/generate-register-options', { method: 'GET' })
  if (error || !options) return error?.message || "Couldn't start. Try again."
  let response: Awaited<ReturnType<typeof Passkey.create>>
  try {
    response = await Passkey.create({
      ...options,
      rp: { ...options.rp, id: options.rp?.id || new URL(SITE_URL).hostname },
    })
  } catch (cause) {
    const text = String((cause as { error?: string })?.error ?? cause)
    if (/cancel/i.test(text)) return 'cancelled'
    // only a confirmed "can't" hides the button; anything else can be retried
    if (/NotSupported|not supported/i.test(text)) return 'unavailable'
    return "Couldn't make a passkey. Try again."
  }
  const saved = await authClient.$fetch('/passkey/verify-registration', {
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
  return saved.error
    ? saved.error.message || "Couldn't save the passkey. Try again."
    : null
}

export type SavedPasskey = {
  id: string
  name?: string | null
  createdAt: string
}

export async function listPasskeys(): Promise<SavedPasskey[]> {
  const { data, error } = await authClient.$fetch<SavedPasskey[]>(
    '/passkey/list-user-passkeys',
    { method: 'GET' },
  )
  if (error) throw new Error(error.message || "Couldn't load your passkeys")
  return data ?? []
}

export async function removePasskey(id: string) {
  const { error } = await authClient.$fetch('/passkey/delete-passkey', {
    method: 'POST',
    body: { id },
  })
  if (error) throw new Error(error.message || "Couldn't remove it")
}
