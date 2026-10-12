/**
 * Stockfish in a Web Worker, in the visitor's browser. The lite single-threaded
 * build needs no cross-origin isolation headers, so it runs on any static host.
 * `pnpm install` copies it into `public/stockfish/` (see `postinstall`).
 */

const ENGINE_URL = '/stockfish/stockfish-19-lite-single.js'

/**
 * Engine verdict on a position: the score, always from White's point of view,
 * and the move Stockfish would play there (UCI, e.g. `e2e4`), if any.
 */
export type Score = ({ cp: number } | { mate: number }) & { best?: string }

export class Engine {
  private worker = new Worker(ENGINE_URL)
  /** Set once the worker dies; every search after that fails fast. */
  private failure: Error | null = null
  /** One search at a time; UCI has no request ids to match replies to. */
  private chain: Promise<unknown> = Promise.resolve()

  constructor() {
    this.worker.postMessage('uci')
    this.worker.postMessage('isready')
  }

  /** Evaluates one position for `movetime` milliseconds. */
  evaluate(fen: string, movetime: number): Promise<Score> {
    const run = this.chain.then(() => this.search(fen, movetime))
    this.chain = run.catch(() => {})
    return run
  }

  private search(fen: string, movetime: number): Promise<Score> {
    const whiteToMove = fen.split(' ')[1] === 'w'

    return new Promise((resolve, reject) => {
      if (this.failure) return reject(this.failure)
      let score: Score = { cp: 0 }

      // A worker that cannot load its script or wasm never answers at all.
      const onError = (event: ErrorEvent) => {
        this.failure = new Error(
          `The chess engine failed to load${event.message ? `: ${event.message}` : '.'}`,
        )
        cleanup()
        reject(this.failure)
      }
      const cleanup = () => {
        this.worker.removeEventListener('message', onMessage)
        this.worker.removeEventListener('error', onError)
      }

      const onMessage = (event: MessageEvent<string>) => {
        const line = String(event.data)
        const match = /score (cp|mate) (-?\d+)/.exec(line)
        if (line.startsWith('info') && match) {
          // UCI scores are from the side to move; flip to White's view.
          const value = Number(match[2]) * (whiteToMove ? 1 : -1)
          score =
            match[1] === 'cp'
              ? { cp: value }
              : // "mate 0": the side to move is already checkmated.
                { mate: value !== 0 ? value : whiteToMove ? -1 : 1 }
        }
        if (line.startsWith('bestmove')) {
          cleanup()
          const best = line.split(' ')[1]
          resolve(best && best !== '(none)' ? { ...score, best } : score)
        }
      }

      this.worker.addEventListener('message', onMessage)
      this.worker.addEventListener('error', onError)
      this.worker.postMessage(`position fen ${fen}`)
      this.worker.postMessage(`go movetime ${movetime}`)
    })
  }

  terminate() {
    this.worker.terminate()
  }
}
