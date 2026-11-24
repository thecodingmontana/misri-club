import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { isIosSafari, isStandalone, useInstall } from '#/lib/pwa'

/** Always the newest Android build: GitHub Actions publishes one per release. */
export const APK_URL =
  'https://github.com/thecodingmontana/misri-club/releases/latest/download/misri.apk'

/** Both ways to have Misri as an app: the Android APK, and installing the site. */
export function GetTheApp() {
  const install = useInstall()
  // browser-only facts, read after mount so server and client markup agree
  const [standalone, setStandalone] = useState(false)
  const [ios, setIos] = useState(false)
  useEffect(() => {
    setStandalone(isStandalone())
    setIos(isIosSafari())
  }, [])

  return (
    <div className="not-prose space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Android app</p>
        <p className="text-xs text-muted-foreground">
          Not on the Play Store yet: your phone asks before installing it.
        </p>
        <Button asChild className="w-full">
          <a href={APK_URL}>Download the APK</a>
        </Button>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Install from your browser</p>
        <p className="text-xs text-muted-foreground">
          {standalone
            ? "You're using the installed app."
            : ios
              ? 'Tap Share, then "Add to Home Screen".'
              : install
                ? 'Opens from your home screen and works offline.'
                : 'Use Install in your browser’s menu (Chrome, Edge or Safari).'}
        </p>
        {install && !standalone && (
          <Button variant="outline" className="w-full" onClick={install}>
            Install Misri
          </Button>
        )}
      </div>
    </div>
  )
}

/** The same two, side by side, for the welcome page: no searching for a link. */
export function AppButtons() {
  const install = useInstall()
  const [standalone, setStandalone] = useState(false)
  useEffect(() => setStandalone(isStandalone()), [])
  if (standalone) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm" className="rounded-xl">
        <a href={APK_URL}>Download for Android</a>
      </Button>
      {install ? (
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={install}
        >
          Install the web app
        </Button>
      ) : (
        <Button asChild variant="ghost" size="sm" className="rounded-xl">
          <Link to="/download">iPhone and other ways</Link>
        </Button>
      )}
    </div>
  )
}
