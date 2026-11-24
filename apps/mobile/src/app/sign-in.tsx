import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import {
  Button,
  Input,
  Label,
  Spinner,
  TextField,
  useThemeColor,
} from 'heroui-native'
import { useState } from 'react'
import { Text } from 'react-native'
import { AuthShell, FormError } from '@/auth-shell'
import { GoogleLogo } from '@/google-logo'
import { Icon } from '@/icon'
import { authClient, authError, signInWithGoogle } from '@/lib/auth'
import { SITE_URL } from '@/lib/config'
import { signInWithPasskey } from '@/lib/passkey'
import { useSession } from '@/lib/session'

type Busy = 'google' | 'passkey' | 'email' | null

/** Sign in like on the website: Google, an emailed code, or a passkey. */
export default function SignIn() {
  const { refresh } = useSession()
  const onAccent = useThemeColor('accent-foreground')
  const [withEmail, setWithEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const valid = /^\S+@\S+\.\S+$/.test(email.trim())

  async function google() {
    setBusy('google')
    setError(null)
    const result = await signInWithGoogle()
    setBusy(null)
    if (result === 'signed-in') return refresh()
    if (result === 'two-factor') return router.push('/two-factor')
    if (result !== 'cancelled') setError(result)
  }

  async function passkey() {
    setBusy('passkey')
    setError(null)
    const result = await signInWithPasskey()
    setBusy(null)
    if (result === null) return refresh()
    if (result !== 'cancelled') setError(result)
  }

  async function send() {
    setBusy('email')
    setError(null)
    const address = email.trim().toLowerCase()
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: address,
      type: 'sign-in',
    })
    setBusy(null)
    if (error) return setError(authError(error))
    router.push({ pathname: '/verify', params: { email: address } })
  }

  return (
    <AuthShell
      title={['Sign in', 'to Misri.']}
      lead="New here? Your account is made the first time you sign in."
    >
      {withEmail ? (
        <>
          <TextField isInvalid={Boolean(error)}>
            <Label>Email</Label>
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => valid && send()}
            />
          </TextField>
          <FormError message={error} />
          <Button size="lg" onPress={send} isDisabled={!valid || busy !== null}>
            {busy === 'email' ? (
              <Spinner color={onAccent} />
            ) : (
              <>
                <Icon name="Mail" color={onAccent} size={18} />
                <Button.Label>Email me a code</Button.Label>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setWithEmail(false)
              setError(null)
            }}
          >
            Other ways to sign in
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="outline"
            size="lg"
            onPress={google}
            isDisabled={busy !== null}
          >
            {busy === 'google' ? <Spinner /> : <GoogleLogo />}
            <Button.Label>Continue with Google</Button.Label>
          </Button>
          <Button
            variant="outline"
            size="lg"
            onPress={() => setWithEmail(true)}
            isDisabled={busy !== null}
          >
            <Icon name="Mail" size={18} />
            <Button.Label>Continue with email</Button.Label>
          </Button>
          <Button
            variant="outline"
            size="lg"
            onPress={passkey}
            isDisabled={busy !== null}
          >
            {busy === 'passkey' ? (
              <Spinner />
            ) : (
              <Icon name="KeyRound" size={18} />
            )}
            <Button.Label>Sign in with a passkey</Button.Label>
          </Button>
          <FormError message={error} />
        </>
      )}
      <Text className="font-normal text-center text-xs text-muted">
        By continuing you agree to the{' '}
        <Text
          className="underline"
          onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/terms`)}
        >
          terms
        </Text>{' '}
        and{' '}
        <Text
          className="underline"
          onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/privacy`)}
        >
          privacy
        </Text>{' '}
        pages.
      </Text>
    </AuthShell>
  )
}
