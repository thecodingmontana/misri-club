import { router } from 'expo-router'
import {
  Button,
  Input,
  Label,
  Spinner,
  TextField,
  useThemeColor,
} from 'heroui-native'
import { useState } from 'react'
import { AuthShell, FormError } from '@/auth-shell'
import { authClient, authError } from '@/lib/auth'

/** Step 1: your email; we send a 6-digit code to it. */
export default function SignIn() {
  const onAccent = useThemeColor('accent-foreground')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /^\S+@\S+\.\S+$/.test(email.trim())

  async function send() {
    setBusy(true)
    setError(null)
    const address = email.trim().toLowerCase()
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: address,
      type: 'sign-in',
    })
    setBusy(false)
    if (error) return setError(authError(error))
    router.push({ pathname: '/verify', params: { email: address } })
  }

  return (
    <AuthShell
      title={['Sign in', 'or join.']}
      lead="New to Misri? The same code makes your account."
    >
      <TextField isInvalid={Boolean(error)}>
        <Label>Email</Label>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => valid && send()}
        />
      </TextField>
      <FormError message={error} />
      <Button size="lg" onPress={send} isDisabled={!valid || busy}>
        {busy ? (
          <Spinner color={onAccent} />
        ) : (
          <Button.Label>Email me a code</Button.Label>
        )}
      </Button>
    </AuthShell>
  )
}
