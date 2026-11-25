import { Uniwind } from 'uniwind'
import * as SecureStore from './storage'

const KEY = 'misri.theme'

/** Applies the saved light or dark choice; the phone's setting until one is made. */
export async function loadTheme() {
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null)
  if (saved === 'light' || saved === 'dark') Uniwind.setTheme(saved)
}

export async function saveTheme(theme: 'light' | 'dark') {
  Uniwind.setTheme(theme)
  await SecureStore.setItemAsync(KEY, theme).catch(() => {})
}
