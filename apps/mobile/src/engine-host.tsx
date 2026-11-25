import { type ComponentRef, useEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { WebView } from 'react-native-webview'
import { SITE_URL } from '@/lib/config'
import { Engine } from '@/lib/uci'

/**
 * A Stockfish for this screen: `engine` to ask, `host` to render somewhere
 * (an invisible web view running the website's engine page).
 */
export function useEngine() {
  const view = useRef<ComponentRef<typeof WebView>>(null)
  const engine = useMemo(
    () =>
      new Engine((command) =>
        view.current?.injectJavaScript(
          `window.uci(${JSON.stringify(command)});true;`,
        ),
      ),
    [],
  )
  useEffect(() => () => engine.terminate(), [engine])
  const host = (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
    >
      <WebView
        ref={view}
        source={{ uri: `${SITE_URL}/stockfish/engine.html` }}
        onMessage={(event) => engine.receive(event.nativeEvent.data)}
        onError={() =>
          engine.receive(
            'error The chess engine did not load. Check your connection and try again.',
          )
        }
      />
    </View>
  )
  return { engine, host }
}
