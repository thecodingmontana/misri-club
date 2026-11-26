import { requireOptionalNativeModule } from 'expo'

type UpdateService = {
  start(title: string, text: string, percent: number): boolean
  progress(title: string, text: string, percent: number): void
  stop(): void
}

// absent on web and in builds made before this module: downloads still work,
// just only while the app is open
const native = requireOptionalNativeModule<UpdateService>('UpdateService')

/**
 * The ongoing "Downloading Misri…" notice that keeps the app running while an
 * update downloads in the background. Every call is safe to make anywhere.
 */
export const downloadNotice = {
  start(title: string, text: string, percent: number) {
    try {
      return native?.start(title, text, percent) ?? false
    } catch {
      return false
    }
  },
  progress(title: string, text: string, percent: number) {
    try {
      native?.progress(title, text, percent)
    } catch {}
  },
  stop() {
    try {
      native?.stop()
    } catch {}
  },
}
