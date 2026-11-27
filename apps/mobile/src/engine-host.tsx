import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { WebView } from 'react-native-webview'
import { ENGINE_PAGE } from '@/engine-page.generated'
import { Engine } from '@/lib/uci'

/**
 * A Stockfish for this screen: `engine` to ask, `host` to render somewhere
 * (an invisible web view running Stockfish, bundled in the app so it works
 * offline: scripts/engine-page.mjs), and `restart`
 * for a fresh one after it failed to load.
 */
export function useEngine() {
  const view = useRef<ComponentRef<typeof WebView>>(null)
  const [generation, setGeneration] = useState(0)
  // a new engine and page per generation
  // biome-ignore lint/correctness/useExhaustiveDependencies: generation is the trigger
  const engine = useMemo(
    () =>
      new Engine((command) =>
        view.current?.injectJavaScript(
          `window.uci(${JSON.stringify(command)});true;`,
        ),
      ),
    [generation],
  )
  useEffect(() => () => engine.terminate(), [engine])
  const host = (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
    >
      <WebView
        key={generation}
        ref={view}
        // any https origin: the page makes its engine from blob: URLs
        source={{ html: ENGINE_PAGE, baseUrl: 'https://misri.local/' }}
        onMessage={(event) => engine.receive(event.nativeEvent.data)}
        onError={() =>
          engine.receive('error The chess engine did not load. Try again.')
        }
      />
    </View>
  )
  return { engine, host, restart: () => setGeneration((g) => g + 1) }
}
