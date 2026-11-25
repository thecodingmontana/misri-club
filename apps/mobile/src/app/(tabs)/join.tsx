import { router } from 'expo-router'
import {
  Button,
  Card,
  Input,
  Label,
  Spinner,
  TextField,
  useThemeColor,
} from 'heroui-native'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native'
import { FormError } from '@/auth-shell'
import { PageTitle } from '@/competitions'
import { Screen } from '@/components'
import { useSession } from '@/lib/session'

/** Join with an invite code: look it up first, then the invite says what it is. */
export default function Join() {
  const { api } = useSession()
  const onAccent = useThemeColor('accent-foreground')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!api) return
    setBusy(true)
    setError(null)
    try {
      const invite = await api.invite(code.trim())
      setBusy(false)
      if (!invite) return setError('No competition has that code.')
      router.push(`/join/${code.trim()}`)
    } catch (cause) {
      setBusy(false)
      setError((cause as Error).message)
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="grow justify-center gap-5 p-4"
          keyboardShouldPersistTaps="handled"
        >
          <PageTitle
            title="Join with a code"
            lead="Ask the organiser for the 8-character code."
          />
          <Card>
            <Card.Body className="gap-3">
              <TextField isInvalid={Boolean(error)}>
                <Label>Invite code</Label>
                <Input
                  value={code}
                  onChangeText={(value) => setCode(value.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  className="text-center text-lg tracking-[6px]"
                  returnKeyType="go"
                  onSubmitEditing={() => code.trim().length === 8 && submit()}
                />
              </TextField>
              <FormError message={error} />
              <Button
                size="lg"
                onPress={submit}
                isDisabled={busy || code.trim().length !== 8}
              >
                {busy ? (
                  <Spinner color={onAccent} />
                ) : (
                  <Button.Label>Continue</Button.Label>
                )}
              </Button>
            </Card.Body>
          </Card>
          <Text className="font-normal text-center text-sm text-muted">
            No code?{' '}
            <Text
              className="font-medium text-accent"
              onPress={() => router.push('/discover')}
            >
              Browse open competitions
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}
