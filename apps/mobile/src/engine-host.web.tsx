import { createElement, useEffect, useMemo, useRef } from 'react'
import { SITE_URL } from '@/lib/config'
import { Engine } from '@/lib/uci'

// The web preview only: the same engine page, in a hidden frame.
export function useEngine() {
  const frame = useRef<HTMLIFrameElement>(null)
  const engine = useMemo(
    () =>
      new Engine((command) =>
        frame.current?.contentWindow?.postMessage({ uci: command }, '*'),
      ),
    [],
  )
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      if (typeof event.data?.engine === 'string')
        engine.receive(event.data.engine)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      engine.terminate()
    }
  }, [engine])
  const host = createElement('iframe', {
    ref: frame,
    src: `${SITE_URL}/stockfish/engine.html`,
    title: 'Chess engine',
    style: { position: 'absolute', width: 1, height: 1, opacity: 0, border: 0 },
  })
  return { engine, host }
}
