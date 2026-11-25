import { deviceName } from '@misri/core/device-name'
import * as Application from 'expo-application'
import * as Clipboard from 'expo-clipboard'
import { router, Stack } from 'expo-router'
import {
  Alert,
  Button,
  Card,
  Input,
  InputOTP,
  Label,
  Spinner,
  TextField,
  useThemeColor,
} from 'heroui-native'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  AppState,
  Linking,
  Alert as NativeAlert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { FormError } from '@/auth-shell'
import { Screen } from '@/components'
import { Choice } from '@/form'
import { Icon } from '@/icon'
import { authClient, authError } from '@/lib/auth'
import { SITE_URL } from '@/lib/config'
import { formatDate, relativeTime } from '@/lib/format'
import { pushStatus, registerForPush } from '@/lib/notifications'
import {
  addPasskey,
  listPasskeys,
  removePasskey,
  usePasskeys,
} from '@/lib/passkey'
import { type Reminders, readReminders, saveReminders } from '@/lib/reminders'
import { useSession } from '@/lib/session'
import { useLoad } from '@/lib/use-load'
import { AccountSkeleton } from '@/skeletons'

/** Your account, section for section as on the website. */
export default function Account() {
  const { me } = useSession()
  const {
    data: session,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const user = session?.user as
    | (NonNullable<typeof session>['user'] & { twoFactorEnabled?: boolean })
    | undefined

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView
        contentContainerClassName="gap-6 p-4 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        {me ? (
          <View className="items-center gap-0.5">
            <Text className="font-semibold text-xs uppercase tracking-widest text-muted">
              Signed in
            </Text>
            <Text className="font-display text-center text-3xl uppercase text-foreground">
              {me.name}
            </Text>
            {user?.email && (
              <Text className="font-normal text-xs text-muted">
                {user.email}
              </Text>
            )}
            {me.chessUsername && (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => router.push(`/p/${me.chessUsername}`)}
              >
                Your player page
              </Button>
            )}
          </View>
        ) : (
          <AccountSkeleton />
        )}

        <Section
          title="Your name"
          lead="What other players see on tables and fixtures."
        >
          {me && <NameForm key={me.name} name={me.name} />}
        </Section>
        <Section
          title="chess.com account"
          lead="Prove which player you are, so your results can be trusted."
        >
          <ChessAccount />
        </Section>
        <Section
          title="Notifications"
          lead="Push notifications on this phone. No emails."
        >
          <Notifications />
        </Section>
        <Section
          title="Training reminders"
          lead="Set on this phone, so they work offline too."
        >
          <TrainingReminders />
        </Section>
        <Section
          title="Calendar"
          lead="Your match deadlines in your phone's calendar, with a reminder the day before. Keep the link to yourself."
        >
          <CalendarLink />
        </Section>
        <Section
          title="Passkeys"
          lead="Sign in with your fingerprint, face or device PIN."
        >
          <Passkeys />
        </Section>
        <Section
          title="Two-step verification"
          lead="Ask for a code from your authenticator app when signing in on a new device."
        >
          {user ? (
            <TwoFactor enabled={Boolean(user.twoFactorEnabled)} />
          ) : (
            <Waiting
              error={sessionError ? authError(sessionError) : null}
              retry={refetch}
            />
          )}
        </Section>
        <Section
          title="Devices"
          lead="Lost a phone or used a shared computer? Sign it out here."
        >
          <Devices />
        </Section>
        <DeleteAccount />
        <About />
      </ScrollView>
    </Screen>
  )
}

function Section({
  title,
  lead,
  children,
}: {
  title: string
  lead: string
  children: ReactNode
}) {
  return (
    <View className="gap-2">
      <View className="gap-0.5 px-1">
        <Text className="font-display text-xl uppercase text-foreground">
          {title}
        </Text>
        <Text className="font-normal text-sm text-muted">{lead}</Text>
      </View>
      <Card>
        <Card.Body className="gap-3">{children}</Card.Body>
      </Card>
    </View>
  )
}

/** A short "done" line under a section's buttons. */
function Done({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Alert status="success">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  )
}

/** Runs one press at a time, keeping its error or "done" line. */
function useTask() {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // a second press before React re-renders must not start a second task
  const active = useRef(false)
  async function run(label: string, work: () => Promise<unknown>) {
    if (active.current) return
    active.current = true
    setBusy(label)
    setError(null)
    setDone(null)
    try {
      const message = await work()
      if (typeof message === 'string') setDone(message)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      active.current = false
      setBusy(null)
    }
  }
  return { busy, error, done, run }
}

/** Still loading: a spinner. Failed: why, and Retry. */
function Waiting({
  error,
  retry,
}: {
  error: string | null
  retry: () => unknown
}) {
  if (!error) return <Spinner />
  return (
    <>
      <FormError message={error} />
      <Button variant="secondary" size="sm" onPress={() => retry()}>
        Retry
      </Button>
    </>
  )
}

function Busy({ on, children }: { on: boolean; children: ReactNode }) {
  const onAccent = useThemeColor('accent-foreground')
  return on ? <Spinner color={onAccent} /> : children
}

function NameForm({ name: saved }: { name: string }) {
  const { refresh } = useSession()
  const [name, setName] = useState(saved)
  const { busy, error, done, run } = useTask()
  return (
    <>
      <TextField isInvalid={Boolean(error)}>
        <Label>Name</Label>
        <Input
          value={name}
          onChangeText={setName}
          maxLength={50}
          autoComplete="name"
          textContentType="name"
        />
      </TextField>
      <FormError message={error} />
      <Done message={done} />
      <Button
        isDisabled={!name.trim() || name.trim() === saved || busy !== null}
        onPress={() =>
          run('name', async () => {
            const { error } = await authClient.updateUser({ name: name.trim() })
            if (error) throw new Error(authError(error))
            await refresh()
            return 'Name saved'
          })
        }
      >
        <Busy on={busy === 'name'}>
          <Button.Label>Save</Button.Label>
        </Busy>
      </Button>
    </>
  )
}

/** Link chess.com, proved with a code in its profile, like onboarding. */
function ChessAccount() {
  const { api, refresh } = useSession()
  const accent = useThemeColor('accent')
  const {
    data,
    error: loadError,
    reload,
  } = useLoad(
    () => (api ? api.chessAccount() : Promise.resolve(null)),
    String(Boolean(api)),
  )
  const [username, setUsername] = useState('')
  const [changing, setChanging] = useState(false)
  const { busy, error, run } = useTask()

  if (!data) return <Waiting error={loadError} retry={reload} />
  if (data.status === 'verified') {
    return (
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-full bg-accent/15">
          <Icon name="ShieldCheck" size={20} color={accent} />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className="font-semibold text-sm text-foreground"
          >
            {data.username}
          </Text>
          <Text className="font-normal text-xs text-muted">
            Linked on chess.com since{' '}
            {formatDate(new Date(data.verifiedAt).toISOString())}
          </Text>
        </View>
        <Button
          variant="ghost"
          size="sm"
          onPress={() =>
            Linking.openURL(
              `https://www.chess.com/member/${encodeURIComponent(data.username)}`,
            )
          }
        >
          <Button.Label>Profile</Button.Label>
          <Icon name="ExternalLink" size={14} />
        </Button>
      </View>
    )
  }
  if (data.status === 'pending' && !changing) {
    return (
      <>
        <Text className="font-normal text-sm text-foreground">
          <Text className="font-semibold">{data.username}</Text> exists on
          chess.com. To prove it's yours, open Settings → Profile there, put
          this code in Location and save:
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Copies the code"
          onPress={() => Clipboard.setStringAsync(data.code)}
          className="rounded-2xl bg-background py-4"
        >
          <Text className="text-center font-bold text-2xl tracking-[6px] text-foreground">
            {data.code}
          </Text>
          <Text className="text-center font-normal text-xs text-muted">
            Tap to copy · works for 30 minutes
          </Text>
        </Pressable>
        <FormError message={error} />
        <Button
          isDisabled={busy !== null}
          onPress={() =>
            run('check', async () => {
              // re-read either way: an expired code gives way to the form
              try {
                await api?.act('checkChessVerification', {})
              } finally {
                await Promise.all([reload(), refresh()])
              }
            })
          }
        >
          <Busy on={busy === 'check'}>
            <Button.Label>Check my profile</Button.Label>
          </Busy>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setUsername(data.username)
            setChanging(true)
          }}
        >
          Use a different username
        </Button>
      </>
    )
  }
  return (
    <>
      <TextField isInvalid={Boolean(error)}>
        <Label>chess.com username</Label>
        <Input
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={40}
          placeholder="Your chess.com username"
        />
      </TextField>
      <FormError message={error} />
      <Button
        isDisabled={!username.trim() || busy !== null}
        onPress={() =>
          run('start', async () => {
            await api?.act('startChessVerification', {
              username: username.trim(),
            })
            setChanging(false)
            await reload()
          })
        }
      >
        <Busy on={busy === 'start'}>
          <Button.Label>Continue</Button.Label>
        </Busy>
      </Button>
    </>
  )
}

function Notifications() {
  const { api } = useSession()
  const accent = useThemeColor('accent')
  const { data: status, error: loadError, reload } = useLoad(pushStatus, 'push')
  const { busy, error, done, run } = useTask()
  // back from the phone's settings: show what changed there
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload()
    })
    return () => sub.remove()
  }, [reload])
  if (!status) return <Waiting error={loadError} retry={reload} />
  if (status !== 'on') {
    return (
      <>
        <Text className="font-normal text-sm text-muted">
          {status === 'blocked'
            ? "Notifications are off for Misri in your phone's settings."
            : "You won't hear about new games, results or deadlines until you turn them on."}
        </Text>
        <FormError message={error} />
        <Button
          isDisabled={busy !== null}
          onPress={() =>
            status === 'blocked'
              ? Linking.openSettings()
              : run('on', async () => {
                  const saved = api ? await registerForPush(api) : false
                  await reload()
                  if (!saved) {
                    throw new Error(
                      "This phone isn't set up for notifications yet. Allow them when asked, check your connection, then try again.",
                    )
                  }
                })
          }
        >
          <Busy on={busy === 'on'}>
            <Icon name="Bell" size={18} />
            <Button.Label>
              {status === 'blocked' ? 'Open settings' : 'Turn on notifications'}
            </Button.Label>
          </Busy>
        </Button>
      </>
    )
  }
  return (
    <>
      <View className="flex-row items-center gap-2">
        <Icon name="CheckCircle" size={18} color={accent} />
        <Text className="font-normal text-sm text-foreground">
          Notifications are on for this phone.
        </Text>
      </View>
      <Text className="font-normal text-xs text-muted">
        Games and deadlines, results, join requests, competition news and the
        weekly summary each have their own switch in your phone's settings.
      </Text>
      <FormError message={error} />
      <Done message={done} />
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          isDisabled={busy !== null}
          onPress={() =>
            run('test', async () => {
              const result = await api?.act('testPush', {})
              if (!result?.sent) {
                throw new Error(
                  'No device took it. Turn notifications off and on, then try again.',
                )
              }
              return 'Sent to your devices. It should arrive in a few seconds.'
            })
          }
        >
          <Busy on={busy === 'test'}>
            <Button.Label>Send a test</Button.Label>
          </Busy>
        </Button>
        <Button
          variant="ghost"
          className="flex-1"
          onPress={() => Linking.openSettings()}
        >
          Choose which
        </Button>
      </View>
    </>
  )
}

const PUZZLE_TIMES = [
  { value: -1, label: 'Off' },
  { value: 7, label: '7am' },
  { value: 12, label: 'Noon' },
  { value: 18, label: '6pm' },
  { value: 21, label: '9pm' },
]

function TrainingReminders() {
  const {
    data: saved,
    error: loadError,
    reload,
  } = useLoad(readReminders, 'reminders')
  const [error, setError] = useState<string | null>(null)
  if (!saved) return <Waiting error={loadError} retry={reload} />
  const change = async (next: Reminders) => {
    setError(null)
    try {
      if (!(await saveReminders(next))) {
        setError(
          "Notifications are off for Misri in your phone's settings, so reminders can't show.",
        )
      }
    } catch (e) {
      setError((e as Error).message)
    }
    await reload()
  }
  return (
    <>
      <Choice
        label="Daily puzzle"
        value={saved.puzzleAt ?? -1}
        options={PUZZLE_TIMES}
        onChange={(hour) =>
          change({ ...saved, puzzleAt: hour === -1 ? null : hour })
        }
      />
      <Choice
        label="Streak warning at 8pm if you haven't trained"
        value={saved.streak ? 'on' : 'off'}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'on', label: 'On' },
        ]}
        onChange={(on) => change({ ...saved, streak: on === 'on' })}
      />
      <FormError message={error} />
    </>
  )
}

function CalendarLink() {
  const { api } = useSession()
  const [path, setPath] = useState<string | null>(null)
  const {
    data,
    error: loadError,
    reload,
  } = useLoad(
    () => (api ? api.calendarPath() : Promise.resolve(null)),
    String(Boolean(api)),
  )
  const { busy, error, done, run } = useTask()
  const current = path ?? data
  if (!current) return <Waiting error={loadError} retry={reload} />
  const url = `${SITE_URL}${current}`
  return (
    <>
      <FormError message={error} />
      <Done message={done} />
      <Button
        isDisabled={busy !== null}
        onPress={() =>
          run('add', async () => {
            await Linking.openURL(url.replace(/^https?:/, 'webcal:')).catch(
              () => {
                throw new Error(
                  'No calendar app opened it. Copy the link and add it in your calendar app.',
                )
              },
            )
          })
        }
      >
        <Icon name="CalendarOutline" size={18} />
        <Button.Label>Add to calendar</Button.Label>
      </Button>
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          isDisabled={busy !== null}
          onPress={() =>
            run('copy', async () => {
              await Clipboard.setStringAsync(url)
              return 'Link copied'
            })
          }
        >
          <Icon name="Copy" size={16} />
          <Button.Label>Copy link</Button.Label>
        </Button>
        <Button
          variant="ghost"
          className="flex-1"
          isDisabled={busy !== null}
          onPress={() =>
            run('reset', async () => {
              const fresh = await api
                ?.act('resetCalendarLink', {})
                .catch(async (e) => {
                  // the reset may have happened anyway: show the link as it is now
                  setPath(null)
                  await reload()
                  throw e
                })
              if (fresh) setPath(fresh.path)
              return 'New link made. Add it to your calendar again.'
            })
          }
        >
          <Busy on={busy === 'reset'}>
            <Button.Label>Reset link</Button.Label>
          </Busy>
        </Button>
      </View>
    </>
  )
}

function Passkeys() {
  const passkeys = usePasskeys()
  const {
    data: keys,
    error: loadError,
    reload,
  } = useLoad(listPasskeys, 'passkeys')
  const { busy, error, done, run } = useTask()
  return (
    <>
      {keys === null ? (
        <Waiting error={loadError} retry={reload} />
      ) : keys.length === 0 ? (
        <Text className="font-normal text-sm text-muted">No passkeys yet.</Text>
      ) : (
        keys.map((key) => (
          <View key={key.id} className="flex-row items-center gap-3">
            <Icon name="KeyRound" size={18} />
            <View className="flex-1">
              <Text className="font-medium text-sm text-foreground">
                {key.name || 'Passkey'}
              </Text>
              <Text className="font-normal text-xs text-muted">
                Added {relativeTime(key.createdAt)}
              </Text>
            </View>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              accessibilityLabel={`Remove ${key.name || 'passkey'}`}
              isDisabled={busy !== null}
              onPress={() =>
                run(key.id, async () => {
                  await removePasskey(key.id)
                  await reload()
                  return 'Passkey removed'
                })
              }
            >
              <Icon name="Trash" size={16} />
            </Button>
          </View>
        ))
      )}
      {/* a change went through but the list didn't come back: say so */}
      {keys !== null && loadError && (
        <Waiting error={loadError} retry={reload} />
      )}
      <FormError message={error} />
      <Done message={done} />
      {passkeys.usable ? (
        <Button
          variant="secondary"
          isDisabled={busy !== null}
          onPress={() =>
            run('add', async () => {
              const result = await addPasskey()
              if (result === 'cancelled') return
              if (result === 'unavailable') {
                passkeys.giveUp()
                throw new Error(
                  "Passkeys don't work on this phone yet. Add one on the website.",
                )
              }
              if (result) throw new Error(result)
              await reload()
              return 'Passkey added. Next time, sign in with it.'
            })
          }
        >
          <Busy on={busy === 'add'}>
            <Icon name="KeyRound" size={18} />
            <Button.Label>Add a passkey</Button.Label>
          </Busy>
        </Button>
      ) : (
        <Text className="font-normal text-xs text-muted">
          This phone can't make passkeys yet. Add one on the website; the ones
          you have still work there.
        </Text>
      )}
    </>
  )
}

/** Authenticator-app codes: set up on this phone, backup codes, or off. */
function TwoFactor({ enabled }: { enabled: boolean }) {
  const accent = useThemeColor('accent')
  // turning it on or off replaces the session: pick up the new token
  const { refresh } = useSession()
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(
    null,
  )
  const [codes, setCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState('')
  const { busy, error, done, run } = useTask()
  const secret = setup ? new URL(setup.uri).searchParams.get('secret') : null

  if (setup) {
    return (
      <>
        <Text className="font-normal text-sm text-foreground">
          Add Misri to your authenticator app, then enter the 6-digit code it
          shows.
        </Text>
        <Button
          onPress={() =>
            Linking.openURL(setup.uri).catch(() =>
              run('open', async () => {
                throw new Error(
                  'No authenticator app opened it. Copy the setup key instead.',
                )
              }),
            )
          }
        >
          <Icon name="ShieldCheck" size={18} />
          <Button.Label>Open in authenticator app</Button.Label>
        </Button>
        {secret && (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Copies the setup key"
            onPress={() => Clipboard.setStringAsync(secret)}
            className="rounded-2xl bg-background px-3 py-3"
          >
            <Text
              selectable
              className="text-center font-mono text-sm tracking-widest text-foreground"
            >
              {secret}
            </Text>
            <Text className="text-center font-normal text-xs text-muted">
              Setup key · tap to copy
            </Text>
          </Pressable>
        )}
        <View className="items-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            isInvalid={Boolean(error)}
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
        <View className="flex-row gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            isDisabled={busy !== null}
            onPress={() => setSetup(null)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            isDisabled={code.length !== 6 || busy !== null}
            onPress={() =>
              run('verify', async () => {
                const { error } = await authClient.twoFactor.verifyTotp({
                  code,
                })
                if (error) {
                  setCode('')
                  throw new Error(authError(error))
                }
                setCodes(setup.codes)
                setSetup(null)
                await refresh()
                return 'Two-step verification is on'
              })
            }
          >
            <Busy on={busy === 'verify'}>
              <Button.Label>Turn on</Button.Label>
            </Busy>
          </Button>
        </View>
      </>
    )
  }

  if (!enabled) {
    return (
      <>
        <FormError message={error} />
        <Done message={done} />
        <Button
          isDisabled={busy !== null}
          onPress={() =>
            run('start', async () => {
              const { data, error } = await authClient.twoFactor.enable({
                method: 'totp',
              })
              if (error || data?.method !== 'totp')
                throw new Error(authError(error))
              setCode('')
              setSetup({ uri: data.totpURI, codes: data.backupCodes })
            })
          }
        >
          <Busy on={busy === 'start'}>
            <Icon name="ShieldCheck" size={18} />
            <Button.Label>Set up two-step verification</Button.Label>
          </Busy>
        </Button>
      </>
    )
  }

  return (
    <>
      <View className="flex-row items-center gap-2">
        <Icon name="ShieldCheck" size={18} color={accent} />
        <Text className="font-normal text-sm text-foreground">
          Two-step verification is on.
        </Text>
      </View>
      <FormError message={error} />
      <Done message={done} />
      {codes ? (
        <View className="gap-2">
          <Text className="font-normal text-xs text-muted">
            Save these backup codes somewhere safe. Each works once, if you lose
            your phone.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Copies all the codes"
            onPress={() => Clipboard.setStringAsync(codes.join('\n'))}
            className="flex-row flex-wrap rounded-2xl bg-background p-3"
          >
            {codes.map((backup) => (
              <Text
                key={backup}
                className="w-1/2 py-0.5 font-mono text-sm text-foreground"
              >
                {backup}
              </Text>
            ))}
          </Pressable>
          <Text className="font-normal text-xs text-muted">Tap to copy</Text>
        </View>
      ) : (
        <Button
          variant="secondary"
          isDisabled={busy !== null}
          onPress={() =>
            run('codes', async () => {
              const { data, error } =
                await authClient.twoFactor.generateBackupCodes({})
              if (error || !data) throw new Error(authError(error))
              setCodes(data.backupCodes)
            })
          }
        >
          <Busy on={busy === 'codes'}>
            <Button.Label>Make new backup codes</Button.Label>
          </Busy>
        </Button>
      )}
      <Button
        variant="danger-soft"
        isDisabled={busy !== null}
        onPress={() =>
          run('off', async () => {
            const { error } = await authClient.twoFactor.disable({})
            if (error) throw new Error(authError(error))
            setCodes(null)
            await refresh()
            return 'Two-step verification is off'
          })
        }
      >
        <Busy on={busy === 'off'}>
          <Button.Label>Turn off two-step verification</Button.Label>
        </Busy>
      </Button>
    </>
  )
}

function Devices() {
  const { signOut } = useSession()
  const {
    data,
    error: loadError,
    reload,
  } = useLoad(async () => {
    const [list, current] = await Promise.all([
      authClient.listSessions(),
      authClient.getSession(),
    ])
    if (list.error) throw new Error(authError(list.error))
    // without knowing which is this phone, every row would offer "Sign out"
    if (current.error || !current.data) {
      throw new Error(authError(current.error))
    }
    return { list: list.data ?? [], currentToken: current.data.session.token }
  }, 'devices')
  const { busy, error, done, run } = useTask()

  return (
    <>
      {!data ? (
        <Waiting error={loadError} retry={reload} />
      ) : (
        data.list.map((s) => {
          const here = s.token === data.currentToken
          return (
            <View key={s.id} className="flex-row items-center gap-3">
              <Icon name="Smartphone" size={18} />
              <View className="flex-1">
                <Text className="font-medium text-sm text-foreground">
                  {deviceName(s.userAgent)}
                </Text>
                <Text className="font-normal text-xs text-muted">
                  {here
                    ? 'This phone'
                    : `Signed in ${relativeTime(new Date(s.createdAt).toISOString())}`}
                </Text>
              </View>
              {!here && (
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={busy !== null}
                  onPress={() =>
                    run(s.token, async () => {
                      const { error } = await authClient.revokeSession({
                        token: s.token,
                      })
                      if (error) throw new Error(authError(error))
                      await reload()
                      return 'Signed that device out'
                    })
                  }
                >
                  <Busy on={busy === s.token}>
                    <Button.Label>Sign out</Button.Label>
                  </Busy>
                </Button>
              )}
            </View>
          )
        })
      )}
      {data && loadError && <Waiting error={loadError} retry={reload} />}
      <FormError message={error} />
      <Done message={done} />
      <Button
        variant="secondary"
        isDisabled={busy !== null}
        onPress={() =>
          run('others', async () => {
            const { error } = await authClient.revokeOtherSessions()
            if (error) throw new Error(authError(error))
            await reload()
            return 'Signed out of every other device'
          })
        }
      >
        <Busy on={busy === 'others'}>
          <Button.Label>Sign out of other devices</Button.Label>
        </Busy>
      </Button>
      <Button
        variant="secondary"
        isDisabled={busy !== null}
        onPress={() => run('out', signOut)}
      >
        <Busy on={busy === 'out'}>
          <Icon name="LogOut" size={18} />
          <Button.Label>Sign out</Button.Label>
        </Busy>
      </Button>
    </>
  )
}

/** Deletes the account and everything tied to it, after asking once more. */
function DeleteAccount() {
  const { signOut } = useSession()
  const { busy, error, run } = useTask()
  const remove = () =>
    run('delete', async () => {
      const { error } = await authClient.deleteUser({ callbackURL: '/' })
      if (error) throw new Error(authError(error))
      await signOut()
    })
  return (
    <View className="gap-2">
      <FormError message={error} />
      <Button
        variant="danger-soft"
        isDisabled={busy !== null}
        onPress={() =>
          NativeAlert.alert(
            'Delete your account?',
            'Your sign-in, passkeys and two-step settings are removed for good, and you leave every competition you joined.',
            [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete it', style: 'destructive', onPress: remove },
            ],
          )
        }
      >
        <Busy on={busy === 'delete'}>
          <Icon name="Trash" size={18} />
          <Button.Label>Delete my account</Button.Label>
        </Busy>
      </Button>
    </View>
  )
}

const CREDITS: Array<[string, string, string]> = [
  ['Puzzles and openings', 'Lichess', 'https://lichess.org'],
  ['Chess engine', 'Stockfish', 'https://stockfishchess.org'],
  ['Photos', 'Unsplash', 'https://unsplash.com'],
  ['Sounds', 'cuelume', 'https://www.npmjs.com/package/cuelume'],
  ['Icons', 'Solar', 'https://icon-sets.iconify.design/solar/'],
  ['Interface', 'HeroUI Native', 'https://heroui.com'],
]

/** The version (as the release names it), who made it, and whose work it uses. */
function About() {
  const build = Application.nativeBuildVersion
  const open = (url: string) => Linking.openURL(url).catch(() => {})
  const link = 'font-medium text-xs text-accent'
  return (
    <View className="items-center gap-3 pt-4">
      <Text className="font-display text-xl uppercase text-foreground">
        Misri
      </Text>
      <Text className="font-normal -mt-2 text-xs text-muted">
        {build ? `Version 0.1.${build}` : 'Version 0.1'} · Made by{' '}
        <Text
          className={link}
          onPress={() => open('https://github.com/thecodingmontana')}
        >
          thecodingmontana
        </Text>
      </Text>
      <View className="w-full gap-1.5 rounded-2xl bg-surface px-4 py-3">
        {CREDITS.map(([what, who, url]) => (
          <View key={what} className="flex-row justify-between gap-3">
            <Text className="font-normal text-xs text-muted">{what}</Text>
            <Text className={link} onPress={() => open(url)}>
              {who}
            </Text>
          </View>
        ))}
      </View>
      <Text className="font-normal text-center text-[11px] text-muted">
        Misri isn't made by or connected to chess.com.
      </Text>
      <View className="flex-row gap-4">
        <Text className={link} onPress={() => open(`${SITE_URL}/privacy`)}>
          Privacy
        </Text>
        <Text className={link} onPress={() => open(`${SITE_URL}/terms`)}>
          Terms
        </Text>
        <Text
          className={link}
          onPress={() => open('https://github.com/thecodingmontana/misri-club')}
        >
          Source code
        </Text>
      </View>
    </View>
  )
}
