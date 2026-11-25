import {
  getAnalytics,
  logScreenView,
  setUserId,
} from '@react-native-firebase/analytics'

// Firebase Analytics (Google Analytics). Builds without google-services.json
// have no Firebase app, so every call is allowed to fail quietly.
const quietly = (run: () => Promise<void>) => {
  try {
    void run().catch(() => {})
  } catch {}
}

/** One screen_view per page, named by its route pattern (no slugs or names). */
export function trackScreen(route: string) {
  quietly(() =>
    logScreenView(getAnalytics(), { screen_name: route, screen_class: route }),
  )
}

/** Ties events to the signed-in account's id (never their name or email). */
export function trackUser(id: string | null) {
  quietly(() => setUserId(getAnalytics(), id))
}
