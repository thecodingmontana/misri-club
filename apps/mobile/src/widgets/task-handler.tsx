import { createApiClient } from '@misri/api-client'
import { fetchDailyPuzzle, puzzleStart } from '@misri/core/puzzle'
import {
  type NextGame,
  nextGame,
  type Standing,
  standing,
} from '@misri/core/widgets'
import type {
  WidgetRepresentation,
  WidgetTaskHandlerProps,
} from 'react-native-android-widget'
import { sessionToken } from '@/lib/auth'
import { API_URL } from '@/lib/config'
import { readProgress, streak } from '@/lib/progress'
import * as Store from '@/lib/storage'
import { boardSvg } from './board-svg'
import {
  DARK,
  LIGHT,
  NextGameWidget,
  type Palette,
  PuzzleWidget,
  SignedOut,
  StandingWidget,
  StreakWidget,
} from './widgets'

/** The names in app.json's widget list. */
export type WidgetName = 'NextGame' | 'Standing' | 'Streak' | 'DailyPuzzle'

interface Games {
  signedIn: boolean
  next: NextGame | null
  standing: Standing | null
}

// the last answer, shown when the phone is offline
const GAMES_KEY = 'misri.widget-games.v1'
const PUZZLE_KEY = 'misri.widget-puzzle.v1'

async function games(): Promise<Games> {
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

/** Today's puzzle position, fetched once a day. */
async function puzzle(): Promise<{
  fen: string | null
  colour: 'white' | 'black'
}> {
  const today = new Date().toLocaleDateString('en-CA')
  const kept = await Store.getItemAsync(PUZZLE_KEY).catch(() => null)
  const cached = kept ? JSON.parse(kept) : null
  if (cached?.day === today) return cached
  try {
    const start = puzzleStart(await fetchDailyPuzzle())
    const fresh = { day: today, fen: start.fen, colour: start.colour }
    await Store.setItemAsync(PUZZLE_KEY, JSON.stringify(fresh))
    return fresh
  } catch {
    return cached ?? { fen: null, colour: 'white' }
  }
}

/** The widget `name` as it should look now, in both themes. */
export async function render(name: string): Promise<WidgetRepresentation> {
  const draw = await drawing(name)
  return { light: draw(LIGHT), dark: draw(DARK) }
}

/** Fetches what the widget shows once, then draws it in any palette. */
async function drawing(
  name: string,
): Promise<(p: Palette) => React.JSX.Element> {
  if (name === 'Streak') {
    const { days } = await readProgress()
    return (palette) => (
      <StreakWidget palette={palette} streak={streak(days)} days={days} />
    )
  }
  if (name === 'DailyPuzzle') {
    const { fen, colour } = await puzzle()
    const board = fen ? boardSvg(fen, colour) : null
    return (palette) => (
      <PuzzleWidget palette={palette} board={board} colour={colour} />
    )
  }
  const data = await games()
  if (!data.signedIn) return (palette) => <SignedOut palette={palette} />
  return (palette) =>
    name === 'Standing' ? (
      <StandingWidget palette={palette} standing={data.standing} />
    ) : (
      <NextGameWidget palette={palette} game={data.next} />
    )
}

export async function widgetTaskHandler({
  widgetInfo,
  widgetAction,
  renderWidget,
}: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK')
    return
  renderWidget(await render(widgetInfo.widgetName))
}
