import { fetchDailyPuzzle, puzzleStart } from '@misri/core/puzzle'
import type {
  WidgetRepresentation,
  WidgetTaskHandlerProps,
} from 'react-native-android-widget'
import { games } from '@/lib/my-games'
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

const PUZZLE_KEY = 'misri.widget-puzzle.v1'

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
