import { useLocalSearchParams } from 'expo-router'
import {
  Button,
  Checkbox,
  ControlField,
  Input,
  InputOTP,
  Label,
  Spinner,
  TextField,
  useThemeColor,
} from 'heroui-native'
import { useState } from 'react'
import { View } from 'react-native'
import { AuthShell, FormError } from '@/auth-shell'
import { Icon } from '@/icon'
import { authClient, authError } from '@/lib/auth'
import { signInWithPasskey, usePasskeys } from '@/lib/passkey'
import { useSession } from '@/lib/session'

/**
 * The second step, as on the website: the authenticator app's code, a backup
 * code, or a passkey. `methods` is unknown after Google, so both show then.
 */
export default function TwoFactor() {
  const { methods = '' } = useLocalSearchParams<{ methods?: string }>()
  const { refresh } = useSession()
  const onAccent = useThemeColor('accent-foreground')
  const [backup, setBackup] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trustDevice, setTrustDevice] = useState(false)
  const hasTotp = !methods || methods.includes('totp')
  const passkeys = usePasskeys()
  const hasPasskey =
    passkeys.usable && (!methods || methods.includes('passkey'))

  async function passkey() {
    setBusy(true)
    setError(null)
    const result = await signInWithPasskey()
    setBusy(false)
    if (result === null) return refresh()
    if (result === 'unavailable') {
      passkeys.giveUp()
      return setError(
        hasTotp
          ? "Passkeys don't work on this phone yet. Use your authenticator app or a backup code."
          : "Passkeys don't work on this phone yet.",
      )
    }
    if (result !== 'cancelled') setError(result)
  }

  async function check(value: string) {
    setBusy(true)
    setError(null)
    const { error } = backup
      ? await authClient.twoFactor.verifyBackupCode({
          code: value.trim(),
          trustDevice,
        })
      : await authClient.twoFactor.verifyTotp({ code: value, trustDevice })
    setBusy(false)
    if (error) {
      setCode('')
      return setError(authError(error))
    }
    await refresh()
  }

  const passkeyButton = (label: string) => (
    <Button variant="outline" size="lg" onPress={passkey} isDisabled={busy}>
      <Icon name="KeyRound" size={18} />
      <Button.Label>{label}</Button.Label>
    </Button>
  )

  // a passkey is this account's only second step: backup codes come only
  // with an authenticator app, so there is nothing else to offer here
  if (!hasTotp) {
    return (
      <AuthShell
        title={['Two-step', 'verification.']}
        lead={
          hasPasskey
            ? "Confirm it's you with the passkey you set up."
            : "Your second step is a passkey, which this phone can't use. Sign in on the website, or add an authenticator app under Account there."
        }
      >
        {hasPasskey && passkeyButton('Continue with your passkey')}
        <FormError message={error} />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={['Two-step', 'verification.']}
      lead={
        backup
          ? 'Enter one of the backup codes you saved when you turned this on.'
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
              <Button.Label>Verify</Button.Label>
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
      <ControlField isSelected={trustDevice} onSelectedChange={setTrustDevice}>
        <ControlField.Indicator>
          <Checkbox />
        </ControlField.Indicator>
        <Label>Trust this device for 30 days</Label>
      </ControlField>
      {hasPasskey && passkeyButton('Use a passkey instead')}
      {hasTotp && (
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setBackup(!backup)
            setCode('')
            setError(null)
          }}
        >
          {backup
            ? 'Use your authenticator app instead'
            : 'Use a backup code instead'}
        </Button>
      )}
    </AuthShell>
  )
}
