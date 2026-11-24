import * as Clipboard from 'expo-clipboard'
import {
  Button,
  Description,
  Input,
  Label,
  Spinner,
  TextField,
  useThemeColor,
} from 'heroui-native'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AuthShell, FormError } from '@/auth-shell'
import { authClient, authError } from '@/lib/auth'
import { useSession } from '@/lib/session'

/**
 * After the first sign-in, like the website: a name, then the chess.com
 * account (proved with a code in its profile) or a skip.
 */
export default function Onboarding() {
  const { me, api, refresh } = useSession()
  const onAccent = useThemeColor('accent-foreground')
  const [step, setStep] = useState<'name' | 'chess'>('name')
  const [name, setName] = useState(me?.name ?? '')
  const [username, setUsername] = useState('')
  const [pending, setPending] = useState<{
    username: string
    code: string
  } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const spinner = <Spinner color={onAccent} />

  if (step === 'name') {
    return (
      <AuthShell
        title={['Welcome to', 'Misri.']}
        lead="Step 1 of 2. What should other players call you?"
      >
        <TextField isInvalid={Boolean(error)}>
          <Label>Your name</Label>
          <Input
            value={name}
            onChangeText={setName}
            maxLength={50}
            autoComplete="name"
            textContentType="name"
          />
        </TextField>
        <FormError message={error} />
        <Button
          size="lg"
          isDisabled={!name.trim() || busy !== null}
          onPress={() =>
            run('name', async () => {
              const { error } = await authClient.updateUser({
                name: name.trim(),
              })
              if (error) throw new Error(authError(error))
              setStep('chess')
            })
          }
        >
          {busy === 'name' ? spinner : <Button.Label>Continue</Button.Label>}
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={['Your', 'chess.com.']}
      lead="Step 2 of 2. Link the account you play on, so competitions read your results. Playing over the board? Skip it."
    >
      {pending ? (
        <>
          <Text className="font-normal text-sm text-foreground">
            On chess.com, open Settings → Profile, put this code in Location and
            save:
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Copies the code"
            onPress={() => Clipboard.setStringAsync(pending.code)}
            className="rounded-2xl bg-surface py-4"
          >
            <Text className="text-center font-bold text-2xl tracking-[6px] text-foreground">
              {pending.code}
            </Text>
            <Text className="text-center font-normal text-xs text-muted">
              Tap to copy · works for 30 minutes
            </Text>
          </Pressable>
          <FormError message={error} />
          <Button
            size="lg"
            isDisabled={busy !== null}
            onPress={() =>
              run('check', async () => {
                await api?.act('checkChessVerification', {})
                await refresh()
              })
            }
          >
            {busy === 'check' ? (
              spinner
            ) : (
              <Button.Label>Check my profile</Button.Label>
            )}
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setPending(null)}>
            Not {pending.username}? Change it
          </Button>
        </>
      ) : (
        <>
          <TextField isInvalid={Boolean(error)}>
            <Label>chess.com username</Label>
            <Input
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={40}
            />
            <Description>
              We'll check it exists, then you prove it's yours.
            </Description>
          </TextField>
          <FormError message={error} />
          <Button
            size="lg"
            isDisabled={!username.trim() || busy !== null}
            onPress={() =>
              run('start', async () => {
                const started = await api?.act('startChessVerification', {
                  username: username.trim(),
                })
                if (started) setPending(started)
              })
            }
          >
            {busy === 'start' ? (
              spinner
            ) : (
              <Button.Label>Link chess.com</Button.Label>
            )}
          </Button>
        </>
      )}
      <View className="flex-row justify-between">
        <Button variant="ghost" size="sm" onPress={() => setStep('name')}>
          Back
        </Button>
        <Button
          variant="ghost"
          size="sm"
          isDisabled={busy !== null}
          onPress={() =>
            run('skip', async () => {
              await api?.act('skipOnboarding', {})
              await refresh()
            })
          }
        >
          Skip: I don't play on chess.com
        </Button>
      </View>
    </AuthShell>
  )
}
