import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { Spinner } from '#/components/auth'
import { Button } from '#/components/ui/button'
import { toast } from '#/lib/toast'
import {
  getPushKeyFn,
  removePushFn,
  savePushFn,
  testPushFn,
} from '#/server/push.functions'

// Account → Notifications: push on or off for the browser or phone in hand.

type State = 'loading' | 'unsupported' | 'denied' | 'off' | 'on'

const supported = () =>
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

// the key comes as base64url; subscribe() wants raw bytes
const keyBytes = (key: string) =>
  Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  )

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/')
  return (await registration?.pushManager.getSubscription()) ?? null
}

const DESCRIPTION: Record<State, string> = {
  loading: 'Checking this device…',
  unsupported:
    "This browser can't get push notifications. On iPhone or iPad, add Misri to your Home Screen first, then open it from there.",
  denied:
    'Notifications are blocked for Misri in this browser. Allow them in the site settings, then come back.',
  off: 'Off on this device. Turn it on for match reminders, starts and new players. Each phone or browser is turned on separately.',
  on: 'On for this device: match reminders, competition starts and new players.',
}

export function PushDevice() {
  const getKey = useServerFn(getPushKeyFn)
  const save = useServerFn(savePushFn)
  const remove = useServerFn(removePushFn)
  const test = useServerFn(testPushFn)
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)

  async function remember(subscription: PushSubscription) {
    const { endpoint, keys } = subscription.toJSON()
    if (!endpoint || !keys?.p256dh || !keys.auth) {
      throw new Error('The browser returned an incomplete subscription.')
    }
    await save({ data: { endpoint, p256dh: keys.p256dh, auth: keys.auth } })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: checks this device once, on open
  useEffect(() => {
    if (!supported()) return setState('unsupported')
    if (Notification.permission === 'denied') return setState('denied')
    currentSubscription()
      .then(async (subscription) => {
        // re-save it, so the server knows this device even if it forgot it
        if (subscription) await remember(subscription)
        setState(subscription ? 'on' : 'off')
      })
      .catch(() => setState('off'))
  }, [])

  async function turnOn() {
    const key = await getKey()
    if (!key) throw new Error("Push isn't set up on the server yet.")
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      if (permission === 'denied') setState('denied')
      throw new Error("Notifications weren't allowed.")
    }
    const registration = await navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none',
    })
    await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    })
    await remember(subscription)
    setState('on')
  }

  async function turnOff() {
    const subscription = await currentSubscription()
    if (subscription) {
      await remove({ data: { endpoint: subscription.endpoint } })
      await subscription.unsubscribe()
    }
    setState('off')
  }

  function run(job: () => Promise<void>, done: string) {
    setBusy(true)
    job()
      .then(() => toast.success(done))
      .catch((error: Error) =>
        toast.error("Couldn't change notifications", { desc: error.message }),
      )
      .finally(() => setBusy(false))
  }

  async function sendTest() {
    try {
      const { sent } = await test()
      if (sent > 0) {
        toast.success('Test notification sent', {
          desc: "Not seeing it? Check your device allows your browser's notifications and Do not disturb is off.",
        })
      } else {
        toast.error('No device got it', { desc: 'Turn it off and on again.' })
      }
    } catch (error) {
      toast.error("Couldn't send a test", { desc: (error as Error).message })
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{DESCRIPTION[state]}</p>
      {(state === 'on' || state === 'off') && (
        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant={state === 'on' ? 'outline' : 'default'}
            disabled={busy}
            onClick={() =>
              state === 'on'
                ? run(turnOff, 'Notifications turned off here')
                : run(turnOn, 'Notifications turned on here')
            }
          >
            {busy && <Spinner />}
            {state === 'on' ? 'Turn off' : 'Turn on'}
          </Button>
          {state === 'on' && (
            <Button variant="secondary" disabled={busy} onClick={sendTest}>
              Send a test
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
