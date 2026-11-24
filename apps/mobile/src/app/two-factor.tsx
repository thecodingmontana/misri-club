import { useLocalSearchParams } from 'expo-router'
import {
  Button,
  Input,
  InputOTP,
  Label,
  Spinner,
  TextField,
  useThemeColor,
} from 'heroui-native'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { AuthShell, FormError } from '@/auth-shell'
import { authClient, authError } from '@/lib/auth'
import { useSession } from '@/lib/session'

/** Step 3, when the account has one: the authenticator app's code, or a backup code. */
export default function TwoFactor() {
  const { methods = '' } = useLocalSearchParams<{ methods?: string }>()
  const { refresh } = useSession()
  const onAccent = useThemeColor('accent-foreground')
  const [backup, setBackup] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function check(value: string) {
    setBusy(true)
    setError(null)
    const { error } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: value.trim() })
      : await authClient.twoFactor.verifyTotp({ code: value })
    setBusy(false)
    if (error) {
      setCode('')
      return setError(authError(error))
    }
    await refresh()
  }

  // a passkey as the only second step can't be used here yet
  if (!methods.includes('totp')) {
    return (
      <AuthShell
        title={['One more', 'step.']}
        lead="Your account's second step is a passkey, which the app can't use yet. Sign in on the website, or add an authenticator app there."
      >
        <Text className="font-normal text-sm text-muted">
          Account → Two-step verification on misri-chess-club.vercel.app.
        </Text>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={['One more', 'step.']}
      lead={
        backup
          ? 'Enter one of the backup codes you saved. Each works once.'
          : 'Enter the 6-digit code from your authenticator app.'
      }
    >
      {backup ? (
        <>
          <TextField isInvalid={Boolean(error)}>
            <Label>Backup code</Label>
            <Input
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => code.trim() && check(code)}
            />
          </TextField>
          <FormError message={error} />
          <Button
            size="lg"
            onPress={() => check(code)}
            isDisabled={!code.trim() || busy}
          >
            {busy ? (
              <Spinner color={onAccent} />
            ) : (
              <Button.Label>Continue</Button.Label>
            )}
          </Button>
        </>
      ) : (
        <>
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
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        onPress={() => {
          setBackup(!backup)
          setCode('')
          setError(null)
        }}
      >
        {backup ? 'Use my authenticator app' : 'Use a backup code'}
      </Button>
    </AuthShell>
  )
}
