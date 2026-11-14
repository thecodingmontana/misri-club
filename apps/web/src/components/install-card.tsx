import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { isIosSafari, isStandalone, useInstall } from '#/lib/pwa'

const DISMISSED = 'misri-install-dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return false
  }
}

/**
 * "Install Misri": shown until the app is installed or the player says no.
 * Chrome/Android get the browser's own install; iPhone gets the Share steps.
 */
export function InstallCard() {
  const install = useInstall()
  // browser-only facts, read after mount so server and client markup agree
  const [hidden, setHidden] = useState(true)
  const [ios, setIos] = useState(false)
  useEffect(() => {
    setIos(isIosSafari())
    setHidden(isStandalone() || readDismissed())
  }, [])

  if (hidden || (!install && !ios)) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {}
    setHidden(true)
  }

  return (
    <section
      aria-label="Install the app"
      className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card"
    >
      <div className="flex items-center gap-3">
        <img
          src="/icon-192.png"
          alt=""
          className="size-11 shrink-0 rounded-xl"
          width={44}
          height={44}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Install Misri</p>
          <p className="text-xs text-muted-foreground">
            {ios
              ? 'Tap Share, then "Add to Home Screen". Match reminders need it on iPhone.'
              : 'Open it from your home screen and get match reminders.'}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {install && (
          <Button className="flex-1 rounded-xl" onClick={install}>
            Install
          </Button>
        )}
        <Button
          variant="ghost"
          className={install ? 'rounded-xl' : 'flex-1 rounded-xl'}
          onClick={dismiss}
        >
          Not now
        </Button>
      </div>
    </section>
  )
}
