import { router, useLocalSearchParams } from 'expo-router'
import { Button, InputOTP, Spinner } from 'heroui-native'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { AuthShell, FormError } from '@/auth-shell'
import { authClient, authError } from '@/lib/auth'
import { useSession } from '@/lib/session'

/** Step 2: the code from the email. */
export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>()
  const { refresh } = useSession()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  async function check(otp: string) {
    setBusy(true)
    setError(null)
    const { data, error } = await authClient.signIn.emailOtp({ email, otp })
    setBusy(false)
    if (error) {
      setCode('')
      return setError(authError(error))
    }
    // the account has an authenticator app: one more code
    const second = data as { twoFactorRedirect?: boolean; methods?: string[] }
    if (second?.twoFactorRedirect) {
      return router.replace({
        pathname: '/two-factor',
        params: { methods: (second.methods ?? []).join(',') },
      })
    }
    await refresh()
  }

  async function resend() {
    setError(null)
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'sign-in',
    })
    if (error) return setError(authError(error))
    setResent(true)
  }

  return (
    <AuthShell
      title={['Check', 'your email.']}
      lead={`We sent a 6-digit code to ${email}. It works for 10 minutes.`}
    >
      <View className="items-center">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={setCode}
          onComplete={check}
          isInvalid={Boolean(error)}
          isDisabled={busy}
          textInputProps={{
            autoFocus: true,
            textContentType: 'oneTimeCode',
            autoComplete: 'sms-otp',
          }}
        >
          <InputOTP.Group>
            <InputOTP.Slot index={0} />
            <InputOTP.Slot index={1} />
            <InputOTP.Slot index={2} />
          </InputOTP.Group>
          <InputOTP.Separator />
          <InputOTP.Group>
            <InputOTP.Slot index={3} />
            <InputOTP.Slot index={4} />
            <InputOTP.Slot index={5} />
          </InputOTP.Group>
        </InputOTP>
      </View>
      <FormError message={error} />
      {busy && <Spinner className="self-center" />}
      <View className="flex-row justify-between">
        <Button variant="ghost" size="sm" onPress={() => router.back()}>
          Different email
        </Button>
        <Button variant="ghost" size="sm" onPress={resend} isDisabled={resent}>
          {resent ? 'Sent again' : 'Send a new code'}
        </Button>
      </View>
      <Text className="text-center font-normal text-xs text-muted">
        Can't find it? Look in spam, or wait a minute.
      </Text>
    </AuthShell>
  )
}
