/**
 * Stockfish in a Web Worker, in the visitor's browser. The lite single-threaded
 * build needs no cross-origin isolation headers, so it runs on any static host.
 * `pnpm install` copies it into `public/stockfish/` (see `postinstall`).
 */

const ENGINE_URL = '/stockfish/stockfish-19-lite-single.js'

/** Engine score, always from White's point of view. */
export type Score = { cp: number } | { mate: number }

export class Engine {
  private worker = new Worker(ENGINE_URL)
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

    return new Promise((resolve) => {
      let score: Score = { cp: 0 }

      const onMessage = (event: MessageEvent<string>) => {
        const line = String(event.data)
        const match = /score (cp|mate) (-?\d+)/.exec(line)
        if (line.startsWith('info') && match) {
          // UCI scores are from the side to move; flip to White's view.
          const value = Number(match[2]) * (whiteToMove ? 1 : -1)
          score = match[1] === 'cp' ? { cp: value } : { mate: value }
        }
        if (line.startsWith('bestmove')) {
          this.worker.removeEventListener('message', onMessage)
          resolve(score)
        }
      }

      this.worker.addEventListener('message', onMessage)
      this.worker.postMessage(`position fen ${fen}`)
      this.worker.postMessage(`go movetime ${movetime}`)
    })
  }

  terminate() {
    this.worker.terminate()
  }
}
