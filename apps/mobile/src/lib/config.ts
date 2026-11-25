import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra as
  | { siteUrl?: string; apiUrl?: string; googleWebClientId?: string }
  | undefined

/** The website, where the account lives (Better Auth, passkeys' domain). */
export const SITE_URL = extra?.siteUrl ?? 'https://misri-chess-club.vercel.app'
/** The Misri API the app reads and writes through. */
export const API_URL = extra?.apiUrl ?? 'https://misri-api.vercel.app'
/** The website's Google client: native Google sign-in asks for a token meant for it. */
export const GOOGLE_WEB_CLIENT_ID = extra?.googleWebClientId
