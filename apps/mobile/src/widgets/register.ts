import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
} from 'react-native-android-widget'
import { render, type WidgetName, widgetTaskHandler } from './task-handler'

/** Lets Android ask the app to draw its home-screen widgets. */
export function registerWidgets() {
  registerWidgetTaskHandler(widgetTaskHandler)
}

/** Redraws these widgets now (only the ones on the home screen). */
export function refreshWidgets(
  names: Array<WidgetName> = ['NextGame', 'Standing', 'Streak', 'DailyPuzzle'],
) {
  for (const widgetName of names) {
    void requestWidgetUpdate({
      widgetName,
      renderWidget: (info) => render(widgetName, info),
    }).catch(() => {})
  }
}
