import * as SecureStore from 'expo-secure-store'

const SEEN_KEY = 'misri.intro-seen'

/** Whether this phone has been through the welcome screens. */
export async function introSeen() {
  try {
    return (await SecureStore.getItemAsync(SEEN_KEY)) === '1'
  } catch {
    return false
  }
}

export async function markIntroSeen() {
  await SecureStore.setItemAsync(SEEN_KEY, '1').catch(() => {})
}
