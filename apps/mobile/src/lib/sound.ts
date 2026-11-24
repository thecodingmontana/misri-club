import {
  type AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio'
import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'
import * as SecureStore from './storage'

// The website's cuelume sounds, recorded by scripts/sounds.cjs.
const FILES = {
  tap: require('../../assets/sounds/tap.wav'),
  select: require('../../assets/sounds/select.wav'),
  navigate: require('../../assets/sounds/navigate.wav'),
  success: require('../../assets/sounds/success.wav'),
  error: require('../../assets/sounds/error.wav'),
  warning: require('../../assets/sounds/warning.wav'),
}
export type Sound = keyof typeof FILES

const KEY = 'misri.sound'
let enabled = true
const players = new Map<Sound, AudioPlayer>()

/** Reads the saved choice (on unless turned off) and lets sounds mix with music. */
export async function loadSoundSetting() {
  enabled = (await SecureStore.getItemAsync(KEY).catch(() => null)) !== 'off'
  // shortcut: ignore failures here; the worst case is a sound ducking music
  await setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
  }).catch(() => {})
  return enabled
}

export function soundOn() {
  return enabled
}

export async function saveSoundOn(on: boolean) {
  enabled = on
  await SecureStore.setItemAsync(KEY, on ? 'on' : 'off').catch(() => {})
}

/** Plays one interface sound (and a light tap you can feel), if sounds are on. */
export function play(sound: Sound) {
  if (!enabled) return
  if (Platform.OS !== 'web' && (sound === 'tap' || sound === 'select')) {
    void Haptics.selectionAsync().catch(() => {})
  }
  try {
    let player = players.get(sound)
    if (!player) {
      player = createAudioPlayer(FILES[sound])
      players.set(sound, player)
    }
    player.seekTo(0)
    player.play()
  } catch {
    // a sound is never worth an error
  }
}
