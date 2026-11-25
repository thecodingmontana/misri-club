import { createApiClient } from '@misri/api-client'
import {
  type NextGame,
  nextGame,
  type Standing,
  standing,
} from '@misri/core/widgets'
import { sessionToken } from '@/lib/auth'
import { API_URL } from '@/lib/config'
import * as Store from '@/lib/storage'

export interface Games {
  signedIn: boolean
  next: NextGame | null
  standing: Standing | null
}

// the last answer, shown when the phone is offline
const GAMES_KEY = 'misri.widget-games.v1'

/** Your next game and standing, from the API; the last answer when offline. */
export async function games(): Promise<Games> {
  const token = await sessionToken()
  if (!token) return { signedIn: false, next: null, standing: null }
  try {
    const api = createApiClient({ url: API_URL, token })
    const [me, mine] = await Promise.all([api.me(), api.myCompetitions()])
    if (!me) return { signedIn: false, next: null, standing: null }
    const pages = (
      await Promise.all(
        mine
          .filter((c) => c.status === 'running')
          .map((c) => api.competition(c.slug)),
      )
    ).filter((page) => page !== null)
    const fresh = {
      signedIn: true,
      next: nextGame(pages, me.id),
      standing: standing(pages, me.id),
    }
    await Store.setItemAsync(GAMES_KEY, JSON.stringify(fresh))
    return fresh
  } catch {
    const kept = await Store.getItemAsync(GAMES_KEY).catch(() => null)
    return kept
      ? (JSON.parse(kept) as Games)
      : { signedIn: true, next: null, standing: null }
  }
}
